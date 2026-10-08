using System.Security.Claims;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Flights;

/// <summary>
/// El proveedor de vuelos que toque en cada momento: el de la variable de entorno del servidor si la hay; si no, el de la
/// clave pegada en Ajustes (guardada cifrada en la base de datos). Una clave de RapidAPI («…msh…jsn…») es de
/// AeroDataBox; cualquier otra, de FlightAware. Recuerda el último fallo para enseñarlo en Ajustes.
/// </summary>
public sealed class DynamicFlightSource(
    IServiceScopeFactory scopes, IHttpClientFactory clients, IDataProtectionProvider protection, string? envAeroApi, string? envAeroDataBox) : IFlightStatusSource
{
    public const string SettingKey = "flights.key";

    private readonly IDataProtector _protector = protection.CreateProtector("Viajes.FlightStatusKey");
    private readonly Lock _lock = new();
    private IFlightStatusSource? _fromApp;
    private string? _appKey;
    private bool _loaded;

    public string? LastError { get; private set; }

    public long? LastOkMs { get; private set; }

    /// <summary>«server» si la clave es una variable de entorno, «app» si se pegó en Ajustes, null si no hay.</summary>
    public string? Origin => FromEnvironment() is not null ? "server" : Current() is not null ? "app" : null;

    /// <summary>Las últimas cuatro letras de la clave en uso, para reconocerla sin enseñarla.</summary>
    public string? Hint
    {
        get
        {
            var key = !string.IsNullOrWhiteSpace(envAeroApi) ? envAeroApi : !string.IsNullOrWhiteSpace(envAeroDataBox) ? envAeroDataBox : (Current() is null ? null : _appKey);
            return key is { Length: > 8 } ? key.Trim()[^4..] : null;
        }
    }

    public string Name => Current()?.Name ?? "";

    public bool IsConfigured => Current() is not null;

    public static bool IsRapidApiKey(string key) => key.Contains("msh", StringComparison.Ordinal) && key.Contains("jsn", StringComparison.Ordinal);

    public async Task<FlightInfo?> GetAsync(string flightNumber, string date, string? origin, long departureUtcMs, CancellationToken ct)
    {
        var source = Current() ?? throw new InvalidOperationException("Sin proveedor de vuelos.");
        try
        {
            var info = await source.GetAsync(flightNumber, date, origin, departureUtcMs, ct);
            LastError = null;
            LastOkMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return info;
        }
        catch (HttpRequestException e)
        {
            LastError = e.StatusCode switch
            {
                System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden =>
                    "El proveedor rechaza la clave: revisa que esté bien copiada y que estés suscrito al plan (Basic, gratis).",
                System.Net.HttpStatusCode.TooManyRequests => "Se han acabado las consultas del mes del plan gratuito.",
                _ => $"El proveedor no responde ({(int?)e.StatusCode ?? 0}).",
            };
            throw;
        }
    }

    /// <summary>Guarda (o borra, con null) la clave pegada en Ajustes.</summary>
    public async Task SaveAsync(string? key, string userId, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == SettingKey, ct);
        if (key is null)
        {
            if (row is not null)
            {
                db.AppSettings.Remove(row);
            }
        }
        else
        {
            row ??= db.AppSettings.Add(new AppSetting { Key = SettingKey, Value = "" }).Entity;
            row.Value = _protector.Protect(key);
            row.UpdatedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            row.UpdatedBy = userId;
        }

        await db.SaveChangesAsync(ct);
        lock (_lock)
        {
            _loaded = false;
            LastError = null;
            LastOkMs = null;
        }
    }

    private IFlightStatusSource? FromEnvironment()
    {
        if (!string.IsNullOrWhiteSpace(envAeroApi))
        {
            return new AeroApiSource(clients.CreateClient("flights"), envAeroApi.Trim());
        }

        return string.IsNullOrWhiteSpace(envAeroDataBox) ? null : new AeroDataBoxSource(clients.CreateClient("flights"), envAeroDataBox.Trim());
    }

    private IFlightStatusSource? Current()
    {
        var env = FromEnvironment();
        if (env is not null)
        {
            return env;
        }

        lock (_lock)
        {
            if (!_loaded)
            {
                using var scope = scopes.CreateScope();
                var row = scope.ServiceProvider.GetRequiredService<AppDbContext>().AppSettings.AsNoTracking().FirstOrDefault(s => s.Key == SettingKey);
                _appKey = null;
                _fromApp = null;
                if (row is not null)
                {
                    try
                    {
                        _appKey = _protector.Unprotect(row.Value);
                        _fromApp = IsRapidApiKey(_appKey)
                            ? new AeroDataBoxSource(clients.CreateClient("flights"), _appKey)
                            : new AeroApiSource(clients.CreateClient("flights"), _appKey);
                    }
                    catch (System.Security.Cryptography.CryptographicException)
                    {
                        // Clave cifrada con otras llaves (por ejemplo, otro servidor): como si no hubiera.
                    }
                }

                _loaded = true;
            }

            return _fromApp;
        }
    }
}

public static class FlightSettingsEndpoints
{
    public sealed record KeyRequest(string? Key);

    public static void MapFlightSettings(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/settings/flight-status").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, DynamicFlightSource source) =>
        {
            if (!await access.IsAdmin(users.GetUserId(principal)!))
            {
                return Results.Problem("Solo quien administra el hogar puede cambiar la clave de los vuelos.", statusCode: StatusCodes.Status403Forbidden);
            }

            return Results.Ok(new { configured = source.IsConfigured, origin = source.Origin, provider = source.Name, hint = source.Hint, lastError = source.LastError, lastOkMs = source.LastOkMs });
        });

        group.MapPut("/", async (KeyRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, DynamicFlightSource source, CancellationToken ct) =>
        {
            var userId = users.GetUserId(principal)!;
            if (!await access.IsAdmin(userId))
            {
                return Results.Problem("Solo quien administra el hogar puede cambiar la clave de los vuelos.", statusCode: StatusCodes.Status403Forbidden);
            }

            var key = body.Key?.Trim();
            if (string.IsNullOrEmpty(key) || key.Length < 20 || key.Length > 200 || key.Any(char.IsWhiteSpace) || key.All(c => c == '•' || c == '*'))
            {
                return Results.Problem("La clave no parece válida: copia la clave completa (letras y números, sin puntos).", statusCode: StatusCodes.Status400BadRequest);
            }

            await source.SaveAsync(key, userId, ct);
            return Results.NoContent();
        });

        group.MapDelete("/", async (ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, DynamicFlightSource source, CancellationToken ct) =>
        {
            var userId = users.GetUserId(principal)!;
            if (!await access.IsAdmin(userId))
            {
                return Results.Problem("Solo quien administra el hogar puede cambiar la clave de los vuelos.", statusCode: StatusCodes.Status403Forbidden);
            }

            await source.SaveAsync(null, userId, ct);
            return Results.NoContent();
        });
    }
}
