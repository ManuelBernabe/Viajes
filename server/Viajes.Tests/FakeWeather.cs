using Viajes.Api.Weather;

namespace Viajes.Tests;

/// <summary>Geocodifica por tabla y da siempre la misma previsión: sol, 24° / 15°, para los próximos 16 días.</summary>
public sealed class FakeWeather : IWeatherSource
{
    public Dictionary<string, GeoPoint> Places { get; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Buenos Aires, Argentina"] = new GeoPoint(-34.6, -58.4, "Buenos Aires"),
        ["Foz do Iguaçu"] = new GeoPoint(-25.5, -54.6, "Foz do Iguaçu"),
    };

    public List<string> Queries { get; } = [];

    public Task<GeoPoint?> GeocodeAsync(string query, CancellationToken ct)
    {
        lock (Queries)
        {
            Queries.Add(query);
        }

        return Task.FromResult(Places.GetValueOrDefault(query));
    }

    public Task<IReadOnlyList<DayForecast>> ForecastAsync(GeoPoint point, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        IReadOnlyList<DayForecast> days = Enumerable.Range(-1, 17)
            .Select(i => new DayForecast(today.AddDays(i).ToString("yyyy-MM-dd"), point.Label == "Buenos Aires" ? 0 : 61, 24.4, 15.2, point.Label == "Buenos Aires" ? 10 : 80))
            .ToList();
        return Task.FromResult(days);
    }
}
