using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Ai;
using Viajes.Api.Data;

namespace Viajes.Api.Trips;

/// <summary>
/// «Información del destino»: por cada país del viaje, moneda (con el cambio del día frente al euro), enchufes y voltaje,
/// teléfono de emergencias, propinas, idioma y si hace falta visado o autorización para los pasaportes del hogar. Lo
/// redacta la IA una vez por viaje e idioma (se guarda; «Actualizar» lo rehace) y el cambio sale de open.er-api.com.
/// A la IA solo van los sitios del viaje y los países de los pasaportes: ni nombres ni números.
/// </summary>
public static class DestinationInfo
{
    public sealed record CountryInfo(
        string Country, string? Flag, string? CurrencyCode, string? CurrencyName, string? Plugs, string? Voltage, string? Emergency, string? Tipping,
        string? Language, string? Visa, List<string>? Tips, string? Embassy = null)
    {
        public double? Rate { get; init; }
    }

    public sealed record InfoDto(List<CountryInfo> Countries, long GeneratedMs, long? RatesMs);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private static readonly Dictionary<string, string> Languages = new() { ["es"] = "español", ["en"] = "English", ["fr"] = "français", ["it"] = "italiano" };

    private const string SystemPrompt = """
        Eres un asesor de viajes riguroso. Para cada país que se visita en el viaje das datos prácticos, breves y
        verificables: moneda (código ISO 4217), tipos de enchufe (letras IEC) y voltaje, número de emergencias, costumbre de
        propinas, idioma principal y requisitos de entrada (visado, eTA/ESTA o nada) para los pasaportes indicados, para
        turismo y estancias cortas. Si un requisito puede haber cambiado, dilo y recomienda comprobarlo en la web oficial del
        país o del ministerio de exteriores. No inventes: si no lo sabes, deja el campo vacío.
        """;

    private static readonly JsonElement Schema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            countries = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        country = new { type = "string" },
                        flag = new { type = "string" },
                        currencyCode = new { type = "string" },
                        currencyName = new { type = "string" },
                        plugs = new { type = "string" },
                        voltage = new { type = "string" },
                        emergency = new { type = "string" },
                        tipping = new { type = "string" },
                        language = new { type = "string" },
                        visa = new { type = "string" },
                        tips = new { type = "array", items = new { type = "string" } },
                        embassy = new { type = "string" },
                    },
                    required = new[] { "country", "flag", "currencyCode", "currencyName", "plugs", "voltage", "emergency", "tipping", "language", "visa", "tips", "embassy" },
                    additionalProperties = false,
                },
            },
        },
        required = new[] { "countries" },
        additionalProperties = false,
    });

    public static string Key(Guid tripId, string lang) => $"dest:{tripId:N}:{lang}";

    public static void MapDestinationInfo(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/trips/{id:guid}/destination-info", Get).RequireAuthorization();
    }

    private static async Task<IResult> Get(
        Guid id, string? lang, bool? refresh, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IJsonAsker ai,
        ExchangeRates rates, ILoggerFactory loggers, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var trip = await access.VisibleTrip(userId, id);
        if (trip is null || trip.DeletedAtMs is not null)
        {
            return Results.NotFound();
        }

        var language = Languages.ContainsKey(lang ?? "") ? lang! : "es";
        var key = Key(id, language);
        var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == key, ct);
        InfoDto? info = row is null ? null : JsonSerializer.Deserialize<InfoDto>(row.Value, Json);
        if (info is null || refresh == true)
        {
            if (!ai.IsAvailable)
            {
                return Results.Problem("La información del destino con IA no está configurada en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            var bookings = await access.VisibleBookings(userId).Where(b => b.TripId == id && b.DeletedAtMs == null).ToListAsync(ct);
            var places = bookings
                .SelectMany(b => new[] { b.StartPlace, b.EndPlace, b.Address })
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => p!.Trim())
                .Distinct()
                .Take(40)
                .ToList();
            var passports = (await access.VisibleDocuments(userId).Where(d => d.Kind == "passport" && d.DeletedAtMs == null && d.Country != null).Select(d => d.Country!).ToListAsync(ct))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var prompt = $"""
                Viaje: «{trip.Title}». Destino: {trip.Destination ?? "(sin indicar)"}. Fechas: {trip.StartDate ?? "?"} a {trip.EndDate ?? "?"}.
                Lugares de las reservas (aeropuertos con código IATA, estaciones, hoteles, direcciones): {string.Join(" | ", places)}.
                Pasaportes de quienes viajan: {(passports.Count == 0 ? "España (supón pasaporte español si no se indica)" : string.Join(", ", passports))}.
                Responde en {Languages[language]}. Un elemento por país visitado (no incluyas el país de origen si solo se sale de él),
                en el orden del viaje. «flag»: el emoji de la bandera. «visa»: qué necesitan esos pasaportes para entrar, en una frase.
                «tips»: dos o tres consejos prácticos y concretos de ese país (transporte, seguridad, costumbres), sin obviedades.
                «embassy»: la embajada o el consulado del país de esos pasaportes más cercano a los sitios del viaje, con la ciudad
                y el teléfono (y el de emergencia consular si lo tiene). Si no estás seguro del teléfono, pon solo el nombre y la ciudad.
                """;
            var json = await ai.AskJsonAsync(SystemPrompt, prompt, Schema, 3000, ct);
            var countries = Parse(json);
            if (countries is null || countries.Count == 0)
            {
                loggers.CreateLogger("Viajes.Destino").LogWarning("Información del destino: sin respuesta útil de la IA.");
                return Results.Problem("No se ha podido preparar la información del destino. Inténtalo dentro de un rato.", statusCode: StatusCodes.Status502BadGateway);
            }

            info = new InfoDto(countries, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), null);
            row ??= db.AppSettings.Add(new AppSetting { Key = key, Value = "" }).Entity;
            row.Value = JsonSerializer.Serialize(info, Json);
            row.UpdatedMs = info.GeneratedMs;
            row.UpdatedBy = userId;
            await db.SaveChangesAsync(ct);
        }

        // El cambio, del día (no se guarda con el resto: cambia).
        var table = await rates.GetAsync(ct);
        if (table is not null)
        {
            info = info with
            {
                Countries = info.Countries.Select(c => c with { Rate = c.CurrencyCode is { } code && table.Value.Rates.TryGetValue(code.ToUpperInvariant(), out var r) ? r : null }).ToList(),
                RatesMs = table.Value.AtMs,
            };
        }

        return Results.Ok(info);
    }

    public static List<CountryInfo>? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("countries", out var list))
            {
                return null;
            }

            string? Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 } s ? s.Trim() : null;
            return list.EnumerateArray()
                .Where(c => Str(c, "country") is not null)
                .Select(c => new CountryInfo(
                    Str(c, "country")!, Str(c, "flag"), Str(c, "currencyCode")?.ToUpperInvariant(), Str(c, "currencyName"), Str(c, "plugs"), Str(c, "voltage"),
                    Str(c, "emergency"), Str(c, "tipping"), Str(c, "language"), Str(c, "visa"),
                    c.TryGetProperty("tips", out var tips) && tips.ValueKind == JsonValueKind.Array
                        ? tips.EnumerateArray().Select(t => t.GetString()).Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t!.Trim()).Take(4).ToList()
                        : [],
                    Str(c, "embassy")))
                .Take(8)
                .ToList();
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

/// <summary>Cambio del euro a otras monedas (open.er-api.com, gratis y sin clave), en memoria durante 6 horas.</summary>
public class ExchangeRates(IHttpClientFactory clients, ILogger<ExchangeRates> log)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(6);
    private (Dictionary<string, double> Rates, long AtMs)? _cached;
    private DateTimeOffset _until = DateTimeOffset.MinValue;

    public virtual async Task<(Dictionary<string, double> Rates, long AtMs)?> GetAsync(CancellationToken ct)
    {
        if (_cached is not null && DateTimeOffset.UtcNow < _until)
        {
            return _cached;
        }

        try
        {
            var http = clients.CreateClient("rates");
            using var doc = JsonDocument.Parse(await http.GetStringAsync("https://open.er-api.com/v6/latest/EUR", ct));
            var rates = doc.RootElement.GetProperty("rates").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetDouble());
            var at = doc.RootElement.TryGetProperty("time_last_update_unix", out var unix) ? unix.GetInt64() * 1000 : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _cached = (rates, at);
            _until = DateTimeOffset.UtcNow + Ttl;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException)
        {
            log.LogWarning("Sin tipos de cambio: {Error}", e.Message);
        }

        return _cached;
    }
}
