using System.Globalization;

namespace Viajes.Api.Weather;

/// <summary>
/// Coordenadas y ciudad de los aeropuertos por su código IATA (datos de OpenFlights, en el propio servidor): el tiempo
/// del sitio al que se llega en avión, sin depender de buscadores ni de la zona horaria (que a veces no es la ciudad).
/// </summary>
public static class Airports
{
    private static readonly Lazy<Dictionary<string, GeoPoint>> All = new(Load);

    public static GeoPoint? Find(string? code) =>
        code is { Length: 3 } && All.Value.TryGetValue(code.ToUpperInvariant(), out var point) ? point : null;

    private static Dictionary<string, GeoPoint> Load()
    {
        var result = new Dictionary<string, GeoPoint>(StringComparer.OrdinalIgnoreCase);
        using var stream = typeof(Airports).Assembly.GetManifestResourceStream("Viajes.Api.Weather.airports.csv");
        if (stream is null)
        {
            return result;
        }

        using var reader = new StreamReader(stream);
        while (reader.ReadLine() is { } line)
        {
            if (line.StartsWith('#'))
            {
                continue;
            }

            var parts = line.Split(';');
            if (parts.Length >= 4
                && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)
                && double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var lon))
            {
                result[parts[0]] = new GeoPoint(lat, lon, parts[3]);
            }
        }

        return result;
    }
}
