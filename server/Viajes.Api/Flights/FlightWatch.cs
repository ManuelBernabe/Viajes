using System.Globalization;
using System.Text.RegularExpressions;
using Viajes.Api.Data;
using Viajes.Api.Push;

namespace Viajes.Api.Flights;

/// <summary>Reglas del seguimiento de vuelos, sin red ni base de datos, para poder probarlas.</summary>
public static partial class FlightWatch
{
    private const long Minute = 60_000;
    private const long Hour = 60 * Minute;

    /// <summary>Se empieza a mirar un vuelo un día antes de que salga.</summary>
    public const long StartBefore = 24 * Hour;

    /// <summary>Un número de vuelo en cualquier parte del texto, en mayúsculas: «IB 3170», «JA3157», «G3 7651».</summary>
    [GeneratedRegex(@"(?<![A-Za-z0-9])([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})(?![0-9:.,])")]
    private static partial Regex FlightNumberPattern();

    /// <summary>«Vuelo: 3157» o «Flight 3157» en las notas: el número sin la aerolínea.</summary>
    [GeneratedRegex(@"(?:vuelo|flight|vol|volo)\s*(?:n[º°o.]*\s*)?:?\s*(\d{1,4})(?![0-9])", RegexOptions.IgnoreCase)]
    private static partial Regex BareNumberPattern();

    /// <summary>Aerolíneas por su nombre, para completar un número de vuelo que viene sin código.</summary>
    private static readonly (string Name, string Code)[] AirlineNames =
    [
        ("iberia express", "I2"), ("iberia", "IB"), ("vueling", "VY"), ("ryanair", "FR"), ("air europa", "UX"),
        ("aerolineas argentinas", "AR"), ("aerolíneas argentinas", "AR"), ("latam", "LA"), ("jetsmart", "JA"),
        ("gol", "G3"), ("azul", "AD"), ("air france", "AF"), ("klm", "KL"), ("lufthansa", "LH"), ("british airways", "BA"),
        ("easyjet", "U2"), ("tap", "TP"), ("ita airways", "AZ"), ("american airlines", "AA"), ("united", "UA"), ("delta", "DL"),
    ];

    /// <summary>«JA 3157 IGR → AEP» → «JA3157»; null si el texto no trae un número de vuelo.</summary>
    public static string? FlightNumber(string text)
    {
        var match = FlightNumberPattern().Match(text);
        return match.Success ? match.Groups[1].Value + match.Groups[2].Value.TrimStart('0').PadLeft(1, '0') : null;
    }

    /// <summary>
    /// El número de vuelo de una reserva: en el título; si no, en las notas; si no, el nombre de la aerolínea (título o
    /// notas) con «Vuelo: 3157» de las notas.
    /// </summary>
    public static string? FlightNumberOf(Booking booking)
    {
        if (FlightNumber(booking.Title) is { } inTitle)
        {
            return inTitle;
        }

        if (booking.Notes is { } notes && FlightNumber(notes) is { } inNotes)
        {
            return inNotes;
        }

        var bare = booking.Notes is null ? null : BareNumberPattern().Match(booking.Notes);
        if (bare is { Success: true })
        {
            var text = $"{booking.Title} {booking.Notes}".ToLowerInvariant();
            foreach (var (name, code) in AirlineNames)
            {
                if (Regex.IsMatch(text, $@"(?<![a-záéíóú]){Regex.Escape(name)}(?![a-záéíóú])"))
                {
                    return code + bare.Groups[1].Value.TrimStart('0').PadLeft(1, '0');
                }
            }
        }

        return null;
    }

    /// <summary>«JA3157|2026-10-08»: lo comparten las reservas del mismo vuelo (una por pasajero).</summary>
    public static string? KeyOf(Booking booking) =>
        booking.Type == "flight" && FlightNumberOf(booking) is { } number ? $"{number}|{booking.StartLocal[..10]}" : null;

    /// <summary>Código IATA de salida si la reserva lo tiene («IGR»).</summary>
    public static string? Origin(Booking booking) =>
        booking.StartPlace is { Length: 3 } place && place.All(char.IsLetter) ? place.ToUpperInvariant() : null;

    /// <summary>
    /// Cada cuánto se consulta: cada 6 h hasta 6 h antes, cada hora hasta 1 h antes, cada 20 min hasta la salida y cada
    /// hora en vuelo hasta que aterriza. Null si no toca mirar (aún es pronto, ya ha terminado o hace mucho que salió).
    /// </summary>
    public static long? Interval(long departureMs, FlightInfo? last, long nowMs)
    {
        if (last is not null && FlightInfo.Final.Contains(last.Status))
        {
            return null;
        }

        var departure = last?.DepEstimatedMs ?? last?.DepScheduledMs ?? departureMs;
        var arrival = last?.ArrivalMs ?? departure + 14 * Hour;
        if (nowMs < departureMs - StartBefore || nowMs > Math.Max(arrival, departure) + 2 * Hour)
        {
            return null;
        }

        var until = departure - nowMs;
        // Pocas consultas: el plan gratuito del proveedor da unas cientos al mes para todos los vuelos del hogar.
        return until > 6 * Hour ? 6 * Hour : until > Hour ? Hour : until > 0 ? 20 * Minute : Hour;
    }

    public static bool IsDue(long departureMs, FlightInfo? last, long? fetchedMs, long nowMs) =>
        Interval(departureMs, last, nowMs) is { } interval && (fetchedMs is null || nowMs - fetchedMs >= interval);

    /// <summary>Lo que ha cambiado y merece un aviso: cancelación, desvío, retraso (de 15 min en 15 min), puerta, terminal y cinta.</summary>
    public static IReadOnlyList<string> Changes(FlightInfo? before, FlightInfo after, string departureTz)
    {
        var changes = new List<string>();
        if (after.Status == "cancelled" && before?.Status != "cancelled")
        {
            return ["❌ Vuelo cancelado. Revisa el correo de la aerolínea."];
        }

        if (after.Status == "diverted" && before?.Status != "diverted")
        {
            changes.Add("↪️ Vuelo desviado");
        }

        var oldDelay = before?.DelayMinutes ?? 0;
        var newDelay = after.DelayMinutes;
        if (after.DepActualMs is null && Math.Abs(newDelay - oldDelay) >= 15)
        {
            var at = after.DepEstimatedMs is { } estimated ? Local(estimated, departureTz) : null;
            changes.Add(newDelay >= 15
                ? $"🕒 Retraso de {Duration(newDelay)}{(at is null ? "" : $": sale a las {at}")}"
                : $"🟢 Vuelve a ir en hora{(at is null ? "" : $": sale a las {at}")}");
        }

        if (after.DepTerminal is not null && after.DepTerminal != before?.DepTerminal && before?.DepTerminal is not null)
        {
            changes.Add($"🏢 Cambio de terminal: {before.DepTerminal} → {after.DepTerminal}");
        }

        if (after.DepGate is not null && after.DepGate != before?.DepGate && after.DepActualMs is null)
        {
            changes.Add(before?.DepGate is null
                ? $"🚪 Puerta {after.DepGate}{(after.DepTerminal is null ? "" : $" · terminal {after.DepTerminal}")}"
                : $"🚪 Cambio de puerta: {before.DepGate} → {after.DepGate}");
        }

        if (after.Baggage is not null && after.Baggage != before?.Baggage)
        {
            changes.Add($"🧳 Equipaje en la cinta {after.Baggage}");
        }

        return changes;
    }

    public static PushMessage Message(Booking booking, IReadOnlyList<string> changes) =>
        new($"✈️ {booking.Title}", string.Join("\n", changes), $"/bookings/{booking.Id}", $"flight-{KeyOf(booking)}");

    private static string Duration(int minutes) => minutes >= 60 ? $"{minutes / 60} h {minutes % 60:00} min" : $"{minutes} min";

    private static string? Local(long utcMs, string timeZone)
    {
        try
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(timeZone);
            return TimeZoneInfo.ConvertTime(DateTimeOffset.FromUnixTimeMilliseconds(utcMs), zone).ToString("HH:mm", CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return null;
        }
    }
}
