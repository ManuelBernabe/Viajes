using System.Text.RegularExpressions;

namespace Viajes.Api.Push;

/// <summary>
/// Cuándo abre el check-in online de cada aerolínea (horas antes de la salida). Comprobado en sus webs o guías en
/// octubre de 2026; las que no están usan 24 h, lo más habitual. La misma tabla está en la app (domain/airlines.ts).
/// </summary>
public static partial class Airlines
{
    public const int DefaultCheckInHours = 24;

    private static readonly Dictionary<string, int> CheckInHours = new()
    {
        ["IB"] = 24, // Iberia
        ["I2"] = 24, // Iberia Express
        ["VY"] = 168, // Vueling: 7 días
        ["FR"] = 24, // Ryanair (gratis sin asiento pagado)
        ["UX"] = 48, // Air Europa
        ["AR"] = 48, // Aerolíneas Argentinas
        ["LA"] = 48, // LATAM
        ["JJ"] = 48, // LATAM Brasil
        ["JA"] = 72, // JetSMART
        ["WJ"] = 72, // JetSMART Argentina
        ["G3"] = 48, // GOL
        ["AD"] = 72, // Azul
    };

    /// <summary>«JA 3140 AEP → IGR» → «JA». Null si el título no empieza por un número de vuelo.</summary>
    public static string? Code(string title)
    {
        var match = FlightNumber().Match(title);
        return match.Success ? match.Groups[1].Value : null;
    }

    public static int CheckInHoursFor(string title) =>
        Code(title) is { } code && CheckInHours.TryGetValue(code, out var hours) ? hours : DefaultCheckInHours;

    [GeneratedRegex(@"^\s*([A-Z0-9]{2})\s?\d{1,4}\b")]
    private static partial Regex FlightNumber();
}
