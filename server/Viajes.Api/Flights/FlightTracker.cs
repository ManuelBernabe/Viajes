using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;
using Viajes.Api.Push;

namespace Viajes.Api.Flights;

/// <summary>Sin clave de ningún proveedor: no hay estado de vuelos.</summary>
public sealed class NoFlightStatusSource : IFlightStatusSource
{
    public string Name => "";

    public Task<FlightInfo?> GetAsync(string flightNumber, string date, string? origin, long departureUtcMs, CancellationToken ct) => Task.FromResult<FlightInfo?>(null);
}

/// <summary>
/// Consulta el estado de un vuelo, lo guarda (uno por vuelo y día, compartido entre pasajeros) y avisa a quienes ven
/// alguna de sus reservas si algo importante cambia.
/// </summary>
public sealed class FlightTracker(AppDbContext db, IFlightStatusSource source, AccessService access, PushService push, ILogger<FlightTracker> log)
{
    private static readonly SemaphoreSlim Gate = new(1, 1);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public bool IsConfigured => source is not NoFlightStatusSource;

    public async Task<(FlightInfo? Info, long? FetchedMs)> CachedAsync(string key, CancellationToken ct)
    {
        var row = await db.FlightStatuses.AsNoTracking().FirstOrDefaultAsync(r => r.Key == key, ct);
        return row is null ? (null, null) : (JsonSerializer.Deserialize<FlightInfo>(row.Json, Json), row.FetchedMs);
    }

    /// <summary>Consulta al proveedor si toca (o si <paramref name="minAgeMs"/> lo permite) y avisa de los cambios.</summary>
    public async Task<(FlightInfo? Info, long? FetchedMs)> RefreshAsync(string key, IReadOnlyList<Booking> bookings, long nowMs, long? minAgeMs, CancellationToken ct)
    {
        if (!IsConfigured || bookings.Count == 0)
        {
            return await CachedAsync(key, ct);
        }

        await Gate.WaitAsync(ct);
        try
        {
            var row = await db.FlightStatuses.FirstOrDefaultAsync(r => r.Key == key, ct);
            var before = row is null ? null : JsonSerializer.Deserialize<FlightInfo>(row.Json, Json);
            var first = bookings[0];
            var due = minAgeMs is { } age
                ? FlightWatch.Interval(first.StartUtcMs, before, nowMs) is not null && (row is null || nowMs - row.FetchedMs >= age)
                : FlightWatch.IsDue(first.StartUtcMs, before, row?.FetchedMs, nowMs);
            if (!due)
            {
                return (before, row?.FetchedMs);
            }

            var number = key.Split('|')[0];
            FlightInfo? after;
            try
            {
                after = await source.GetAsync(number, first.StartLocal[..10], FlightWatch.Origin(first), first.StartUtcMs, ct);
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException)
            {
                log.LogWarning("Estado de {Vuelo}: {Proveedor} no responde ({Error}).", number, source.Name, e.Message);
                return (before, row?.FetchedMs);
            }

            if (row is null)
            {
                row = new FlightStatusRow { Key = key, Json = "{}" };
                db.FlightStatuses.Add(row);
            }

            row.FetchedMs = nowMs;
            if (after is null)
            {
                // El proveedor aún no lo tiene: se apunta la consulta para no repetirla enseguida.
                row.Json = before is null ? JsonSerializer.Serialize(new FlightInfo { Source = source.Name }, Json) : row.Json;
                await db.SaveChangesAsync(ct);
                return (before, nowMs);
            }

            row.Json = JsonSerializer.Serialize(after, Json);
            await db.SaveChangesAsync(ct);
            await NotifyAsync(before, after, bookings, ct);
            return (after, nowMs);
        }
        finally
        {
            Gate.Release();
        }
    }

    private async Task NotifyAsync(FlightInfo? before, FlightInfo after, IReadOnlyList<Booking> bookings, CancellationToken ct)
    {
        // Un registro vacío (el proveedor aún no lo conocía) cuenta como «no se sabía nada».
        var previous = before is { DepScheduledMs: null, Status: "unknown" } ? null : before;
        var changes = FlightWatch.Changes(previous, after, bookings[0].StartTz);
        if (changes.Count == 0)
        {
            return;
        }

        // A cada persona, una sola vez aunque vea varias reservas del vuelo (la de cada pasajero), con enlace a la suya.
        var notified = new HashSet<string>();
        foreach (var booking in bookings)
        {
            var audience = (await access.BookingAudience(booking)).Where(notified.Add).ToList();
            await push.SendToUsersAsync(audience, FlightWatch.Message(booking, changes), ct);
        }
    }

    public static IServiceCollection AddFlightStatus(IServiceCollection services, IConfiguration config)
    {
        services.AddHttpClient("flights", client => client.Timeout = TimeSpan.FromSeconds(15));
        var aeroApi = config["AEROAPI_KEY"];
        var aeroDataBox = config["AERODATABOX_KEY"];
        if (!string.IsNullOrWhiteSpace(aeroApi))
        {
            services.AddSingleton<IFlightStatusSource>(p => new AeroApiSource(p.GetRequiredService<IHttpClientFactory>().CreateClient("flights"), aeroApi.Trim()));
        }
        else if (!string.IsNullOrWhiteSpace(aeroDataBox))
        {
            services.AddSingleton<IFlightStatusSource>(p => new AeroDataBoxSource(p.GetRequiredService<IHttpClientFactory>().CreateClient("flights"), aeroDataBox.Trim()));
        }
        else
        {
            services.AddSingleton<IFlightStatusSource, NoFlightStatusSource>();
        }

        services.AddScoped<FlightTracker>();
        services.AddHostedService<FlightWatchService>();
        return services;
    }
}

/// <summary>Cada cinco minutos mira qué vuelos de las próximas 24 h (o en el aire) toca consultar.</summary>
public sealed class FlightWatchService(IServiceProvider services, IFlightStatusSource source, ILogger<FlightWatchService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (source is NoFlightStatusSource)
        {
            log.LogInformation("Estado de vuelos desactivado: falta AEROAPI_KEY o AERODATABOX_KEY.");
            return;
        }

        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken).ContinueWith(_ => { }, TaskScheduler.Default);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Fallo al seguir los vuelos.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tracker = scope.ServiceProvider.GetRequiredService<FlightTracker>();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var from = now - 20 * 3_600_000L;
        var to = now + FlightWatch.StartBefore;
        var flights = await db.Bookings
            .Where(b => b.Type == "flight" && b.DeletedAtMs == null && b.StartUtcMs >= from && b.StartUtcMs <= to)
            .ToListAsync(ct);
        foreach (var group in flights.GroupBy(FlightWatch.KeyOf).Where(g => g.Key is not null))
        {
            await tracker.RefreshAsync(group.Key!, group.OrderBy(b => b.StartUtcMs).ToList(), now, null, ct);
        }
    }
}

public static class FlightEndpoints
{
    /// <summary>Si se pide desde la app, se vuelve a consultar como mucho cada 10 minutos.</summary>
    public const long ManualMinAgeMs = 10 * 60_000;

    public static void MapFlightEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/bookings/{id:guid}/flight-status", async (
            Guid id, bool? refresh, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, FlightTracker tracker,
            CancellationToken ct) =>
        {
            var userId = users.GetUserId(principal)!;
            var booking = await access.VisibleBooking(userId, id);
            var key = booking is null || booking.DeletedAtMs is not null ? null : FlightWatch.KeyOf(booking);
            if (key is null)
            {
                return Results.NotFound();
            }

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            (FlightInfo? Info, long? FetchedMs) result;
            if (refresh == true && tracker.IsConfigured)
            {
                // Todas las reservas del mismo vuelo, para que el aviso de un cambio llegue a todos.
                var siblings = (await db.Bookings.Where(b => b.Type == "flight" && b.DeletedAtMs == null && b.StartUtcMs == booking!.StartUtcMs).ToListAsync(ct))
                    .Where(b => FlightWatch.KeyOf(b) == key)
                    .OrderBy(b => b.Id == booking!.Id ? 0 : 1)
                    .ToList();
                result = await tracker.RefreshAsync(key, siblings, now, ManualMinAgeMs, ct);
            }
            else
            {
                result = await tracker.CachedAsync(key, ct);
            }

            var info = result.Info is { DepScheduledMs: null, Status: "unknown" } ? null : result.Info;
            return Results.Ok(new
            {
                configured = tracker.IsConfigured,
                flight = key.Split('|')[0],
                trackingFromMs = booking!.StartUtcMs - FlightWatch.StartBefore,
                fetchedMs = result.FetchedMs,
                info,
                delayMinutes = info?.DelayMinutes ?? 0,
            });
        }).RequireAuthorization();
    }
}
