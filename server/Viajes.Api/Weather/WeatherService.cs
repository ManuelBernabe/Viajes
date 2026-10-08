using System.Collections.Concurrent;
using System.Globalization;
using Viajes.Api.Data;

namespace Viajes.Api.Weather;

/// <summary>El tiempo de un día del viaje en el sitio donde se está ese día.</summary>
public sealed record DayWeather(string Date, string Place, int? Code, double? Max, double? Min, int? Rain);

/// <summary>
/// La previsión día a día de un viaje. El sitio de cada día es el del hotel donde se duerme esa noche (su dirección o su
/// nombre); si no hay hotel, el de la mañana; si tampoco, el destino del viaje. Guarda en memoria las coordenadas y la
/// previsión (una hora) para no repetir consultas.
/// </summary>
public sealed class WeatherService(IWeatherSource source, ILogger<WeatherService> log)
{
    /// <summary>Open-Meteo da 16 días por delante.</summary>
    public const int ForecastDays = 16;

    private static readonly TimeSpan ForecastTtl = TimeSpan.FromHours(1);
    private static readonly TimeSpan MissTtl = TimeSpan.FromHours(6);

    private readonly ConcurrentDictionary<string, (GeoPoint? Point, DateTimeOffset Until)> _places = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, (IReadOnlyList<DayForecast> Days, DateTimeOffset Until)> _forecasts = new();

    /// <summary>Los días del viaje (o los de sus reservas) que caen dentro de la previsión, con el sitio buscado para cada uno.</summary>
    public static IReadOnlyList<(string Date, IReadOnlyList<string> Queries)> DayQueries(Trip trip, IReadOnlyCollection<Booking> bookings, string today)
    {
        var alive = bookings.Where(b => b.DeletedAtMs is null).ToList();
        var first = trip.StartDate ?? alive.Select(b => b.StartLocal[..10]).DefaultIfEmpty().Min();
        var last = trip.EndDate ?? alive.Select(b => (b.EndLocal ?? b.StartLocal)[..10]).DefaultIfEmpty().Max();
        if (first is null || last is null)
        {
            return [];
        }

        var from = string.CompareOrdinal(first, today) > 0 ? first : today;
        var horizon = Shift(today, ForecastDays - 1);
        var to = string.CompareOrdinal(last, horizon) < 0 ? last : horizon;
        var hotels = alive.Where(b => b.Type == "hotel").OrderBy(b => b.StartUtcMs).ToList();
        var result = new List<(string, IReadOnlyList<string>)>();
        for (var date = from; string.CompareOrdinal(date, to) <= 0; date = Shift(date, 1))
        {
            var night = hotels.LastOrDefault(h => string.CompareOrdinal(h.StartLocal[..10], date) <= 0 && string.CompareOrdinal(date, CheckOut(h)) < 0)
                ?? hotels.LastOrDefault(h => CheckOut(h) == date);
            var queries = new List<string>();
            if (night is not null)
            {
                queries.AddRange(HotelQueries(night));
                if (CityOfZone(night.StartTz) is { } hotelCity)
                {
                    queries.Add(hotelCity);
                }
            }

            // Sin hotel: la ciudad de llegada del último vuelo o tren del día (por su zona horaria), antes que el nombre
            // del viaje, que puede ser ambiguo («Argentina Brasil» llevaba a una calle de Criciúma).
            var arrival = alive.Where(b => (b.Type == "flight" || b.Type == "train") && b.StartLocal[..10] == date && b.EndTz is not null)
                .OrderBy(b => b.StartUtcMs).LastOrDefault();
            if (arrival is not null && CityOfZone(arrival.EndTz!) is { } arrivalCity)
            {
                queries.Add(arrivalCity);
            }

            if (!string.IsNullOrWhiteSpace(trip.Destination))
            {
                queries.Add(trip.Destination.Trim());
            }

            if (queries.Count > 0)
            {
                result.Add((date, queries.Distinct(StringComparer.OrdinalIgnoreCase).ToList()));
            }
        }

        return result;
    }

    /// <summary>Dirección completa y luego cada vez más general («…, Buenos Aires, Argentina» → «Buenos Aires, Argentina»); al final, el nombre del hotel.</summary>
    public static IEnumerable<string> HotelQueries(Booking hotel)
    {
        if (!string.IsNullOrWhiteSpace(hotel.Address))
        {
            var parts = hotel.Address.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            for (var i = 0; i < parts.Length; i++)
            {
                // El país solo no sirve: daría el tiempo del centro del país.
                if (parts.Length - i >= 2 || (i == 0 && parts.Length == 1))
                {
                    yield return string.Join(", ", parts[i..]);
                }
            }
        }

        var name = string.IsNullOrWhiteSpace(hotel.StartPlace) ? hotel.Title : hotel.StartPlace;
        if (!string.IsNullOrWhiteSpace(name))
        {
            // Con la ciudad de su zona horaria, para no dar con otro hotel del mismo nombre en otro país.
            yield return CityOfZone(hotel.StartTz) is { } city ? $"{name.Trim()}, {city}" : name.Trim();
        }
    }

    public async Task<IReadOnlyList<DayWeather>> ForTripAsync(Trip trip, IReadOnlyCollection<Booking> bookings, CancellationToken ct)
    {
        var today = DateTimeOffset.UtcNow.AddHours(-12).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var days = new List<DayWeather>();
        foreach (var (date, queries) in DayQueries(trip, bookings, today))
        {
            var point = await PointAsync(queries, ct);
            if (point is null)
            {
                continue;
            }

            var forecast = (await ForecastAsync(point, ct)).FirstOrDefault(f => f.Date == date);
            if (forecast is not null && forecast.Code is not null)
            {
                days.Add(new DayWeather(date, point.Label, forecast.Code, forecast.Max, forecast.Min, forecast.Rain));
            }
        }

        return days;
    }

    private async Task<GeoPoint?> PointAsync(IReadOnlyList<string> queries, CancellationToken ct)
    {
        foreach (var query in queries)
        {
            var now = DateTimeOffset.UtcNow;
            if (_places.TryGetValue(query, out var cached) && cached.Until > now)
            {
                if (cached.Point is not null)
                {
                    return cached.Point;
                }

                continue;
            }

            var point = await source.GeocodeAsync(query, ct);
            _places[query] = (point, point is null ? now + MissTtl : DateTimeOffset.MaxValue);
            if (point is not null)
            {
                return point;
            }
        }

        return null;
    }

    private async Task<IReadOnlyList<DayForecast>> ForecastAsync(GeoPoint point, CancellationToken ct)
    {
        var key = string.Create(CultureInfo.InvariantCulture, $"{point.Lat:0.00},{point.Lon:0.00}");
        if (_forecasts.TryGetValue(key, out var cached) && cached.Until > DateTimeOffset.UtcNow)
        {
            return cached.Days;
        }

        try
        {
            var days = await source.ForecastAsync(point, ct);
            _forecasts[key] = (days, DateTimeOffset.UtcNow + ForecastTtl);
            return days;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException)
        {
            log.LogWarning("Sin previsión para {Sitio}: {Error}", point.Label, e.Message);
            return cached.Days ?? [];
        }
    }

    /// <summary>«America/Argentina/Buenos_Aires» → «Buenos Aires»; null para zonas que no son ciudades («UTC», «Etc/GMT+3»).</summary>
    public static string? CityOfZone(string? zone)
    {
        if (string.IsNullOrWhiteSpace(zone) || !zone.Contains('/') || zone.StartsWith("Etc/", StringComparison.Ordinal))
        {
            return null;
        }

        return zone[(zone.LastIndexOf('/') + 1)..].Replace('_', ' ');
    }

    private static string CheckOut(Booking hotel) => hotel.EndLocal?[..10] ?? Shift(hotel.StartLocal[..10], 1);

    private static string Shift(string date, int days) =>
        DateTime.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(days).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
