using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Api.Weather;

/// <summary>Un punto en el mapa con el nombre del sitio («Buenos Aires»).</summary>
public sealed record GeoPoint(double Lat, double Lon, string Label);

/// <summary>La previsión de un día en hora local del lugar: código WMO, máxima, mínima y probabilidad de lluvia.</summary>
public sealed record DayForecast(string Date, int? Code, double? Max, double? Min, int? Rain);

/// <summary>De dónde salen los datos del tiempo; en las pruebas se sustituye por uno falso.</summary>
public interface IWeatherSource
{
    /// <summary>Busca un sitio por dirección o nombre. Null si no lo encuentra.</summary>
    Task<GeoPoint?> GeocodeAsync(string query, CancellationToken ct);

    /// <summary>Los próximos días (hasta 16) en ese punto.</summary>
    Task<IReadOnlyList<DayForecast>> ForecastAsync(GeoPoint point, CancellationToken ct);
}

/// <summary>
/// Open-Meteo para la previsión (gratis, sin clave) y Nominatim (OpenStreetMap) para pasar direcciones a coordenadas; si
/// Nominatim no responde, el buscador de nombres de Open-Meteo. No se envía nada personal: solo la dirección del hotel o
/// el nombre del destino.
/// </summary>
public sealed class OpenMeteoWeatherSource(IHttpClientFactory clients, ILogger<OpenMeteoWeatherSource> log) : IWeatherSource
{
    public const string ClientName = "weather";

    /// <summary>Nominatim pide como mucho una consulta por segundo.</summary>
    private static readonly SemaphoreSlim NominatimGate = new(1, 1);
    private static DateTimeOffset _lastNominatim = DateTimeOffset.MinValue;

    public async Task<GeoPoint?> GeocodeAsync(string query, CancellationToken ct)
    {
        var http = clients.CreateClient(ClientName);
        try
        {
            await NominatimGate.WaitAsync(ct);
            try
            {
                var wait = _lastNominatim.AddSeconds(1.1) - DateTimeOffset.UtcNow;
                if (wait > TimeSpan.Zero)
                {
                    await Task.Delay(wait, ct);
                }

                _lastNominatim = DateTimeOffset.UtcNow;
                var url = $"https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&accept-language=es&q={Uri.EscapeDataString(query)}";
                using var doc = JsonDocument.Parse(await http.GetStringAsync(url, ct));
                if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                {
                    var hit = doc.RootElement[0];
                    var label = LabelOf(hit) ?? query;
                    return new GeoPoint(ParseDouble(hit.GetProperty("lat")), ParseDouble(hit.GetProperty("lon")), label);
                }

                return null;
            }
            finally
            {
                NominatimGate.Release();
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException)
        {
            log.LogWarning("Nominatim no responde ({Error}); se prueba con Open-Meteo.", e.Message);
        }

        // Plan B: el buscador de Open-Meteo solo entiende nombres de sitios, no direcciones.
        if (query.Any(char.IsDigit))
        {
            return null;
        }

        try
        {
            var url = $"https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name={Uri.EscapeDataString(query)}";
            using var doc = JsonDocument.Parse(await http.GetStringAsync(url, ct));
            if (doc.RootElement.TryGetProperty("results", out var results) && results.GetArrayLength() > 0)
            {
                var hit = results[0];
                return new GeoPoint(hit.GetProperty("latitude").GetDouble(), hit.GetProperty("longitude").GetDouble(), hit.GetProperty("name").GetString() ?? query);
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException)
        {
            log.LogWarning("Sin geocodificación para «{Sitio}»: {Error}", query, e.Message);
        }

        return null;
    }

    public async Task<IReadOnlyList<DayForecast>> ForecastAsync(GeoPoint point, CancellationToken ct)
    {
        var http = clients.CreateClient(ClientName);
        var url = string.Create(
            CultureInfo.InvariantCulture,
            $"https://api.open-meteo.com/v1/forecast?latitude={point.Lat:0.###}&longitude={point.Lon:0.###}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16&past_days=1");
        var json = await http.GetFromJsonAsync<JsonElement>(url, ct);
        return ParseForecast(json);
    }

    /// <summary>Lee la respuesta «daily» de Open-Meteo (listas en paralelo, con nulos donde no hay dato).</summary>
    public static IReadOnlyList<DayForecast> ParseForecast(JsonElement json)
    {
        if (!json.TryGetProperty("daily", out var daily) || !daily.TryGetProperty("time", out var times))
        {
            return [];
        }

        var days = new List<DayForecast>();
        for (var i = 0; i < times.GetArrayLength(); i++)
        {
            days.Add(new DayForecast(
                times[i].GetString() ?? "",
                (int?)Value(daily, "weather_code", i),
                Value(daily, "temperature_2m_max", i),
                Value(daily, "temperature_2m_min", i),
                (int?)Value(daily, "precipitation_probability_max", i)));
        }

        return days;
    }

    private static double? Value(JsonElement daily, string name, int index) =>
        daily.TryGetProperty(name, out var list) && index < list.GetArrayLength() && list[index].ValueKind == JsonValueKind.Number
            ? list[index].GetDouble()
            : null;

    private static double ParseDouble(JsonElement value) =>
        value.ValueKind == JsonValueKind.Number ? value.GetDouble() : double.Parse(value.GetString()!, CultureInfo.InvariantCulture);

    private static string? LabelOf(JsonElement hit)
    {
        if (hit.TryGetProperty("address", out var address))
        {
            foreach (var key in new[] { "city", "town", "village", "municipality", "county", "state" })
            {
                if (address.TryGetProperty(key, out var value) && value.GetString() is { Length: > 0 } text)
                {
                    return text;
                }
            }
        }

        return hit.TryGetProperty("name", out var name) ? name.GetString() : null;
    }
}
