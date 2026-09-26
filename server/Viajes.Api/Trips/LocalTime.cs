using System.Globalization;

namespace Viajes.Api.Trips;

public static class LocalTime
{
    private static readonly string[] Formats = ["yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss"];

    /// <summary>
    /// «2026-10-12T10:05» en «Europe/Madrid» → milisegundos UTC. Una hora que no existe por el cambio de hora
    /// se desplaza una hora hacia delante; una ambigua se toma en horario estándar.
    /// </summary>
    public static long ToUtcMs(string local, string timeZone)
    {
        var zone = FindZone(timeZone) ?? throw new ArgumentException("Zona horaria desconocida.", nameof(timeZone));
        if (!DateTime.TryParseExact(local, Formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var naive))
        {
            throw new ArgumentException("Hora local no válida.", nameof(local));
        }

        var unspecified = DateTime.SpecifyKind(naive, DateTimeKind.Unspecified);
        if (zone.IsInvalidTime(unspecified))
        {
            unspecified = unspecified.AddHours(1);
        }

        var utc = TimeZoneInfo.ConvertTimeToUtc(unspecified, zone);
        return new DateTimeOffset(utc, TimeSpan.Zero).ToUnixTimeMilliseconds();
    }

    public static bool IsValidZone(string timeZone) => FindZone(timeZone) is not null;

    public static bool IsValidLocal(string local) =>
        DateTime.TryParseExact(local, Formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static TimeZoneInfo? FindZone(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (TimeZoneNotFoundException)
        {
            return null;
        }
        catch (InvalidTimeZoneException)
        {
            return null;
        }
    }
}
