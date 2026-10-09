using System.Globalization;
using Viajes.Api.Data;
using Viajes.Api.Trips;

namespace Viajes.Api.Push;

/// <summary>Un aviso que toca enviar para una reserva.</summary>
public sealed record DueReminder(Booking Booking, string Kind, long DueMs, PushMessage Message);

/// <summary>
/// Reglas de los recordatorios, sin base de datos ni red, para poder probarlas:
/// la víspera a las 20:00 (hora del lugar de salida) un resumen de todo lo de mañana para cada persona, tres horas antes
/// de la salida y, en los vuelos, cuando abre el check-in online (el momento de elegir asiento).
/// Cada aviso se envía una vez por reserva y hora de salida; si la hora cambia, vuelve a tocar.
/// </summary>
public static class Reminders
{
    public const string Eve = "eve";
    public const string Soon = "soon";
    public const string Change = "change";
    public const string CheckIn = "checkin";

    public const int EveHour = 20;
    public static readonly TimeSpan SoonBefore = TimeSpan.FromHours(3);

    /// <summary>Ventana en la que un aviso atrasado aún se envía (el servidor pudo estar parado).</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(90);

    private static readonly Dictionary<string, string> TypeLabels = new()
    {
        ["flight"] = "Vuelo", ["train"] = "Tren", ["hotel"] = "Hotel", ["car"] = "Coche", ["ticket"] = "Entrada", ["other"] = "Reserva",
    };

    /// <summary>Instante UTC de la víspera a las 20:00 en la zona de salida; null si la zona no se reconoce.</summary>
    public static long? EveMs(Booking booking)
    {
        if (!DateTime.TryParseExact(booking.StartLocal[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
        {
            return null;
        }

        var eve = day.AddDays(-1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + $"T{EveHour:00}:00";
        try
        {
            return LocalTime.ToUtcMs(eve, booking.StartTz);
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    public static long SoonMs(Booking booking) => booking.StartUtcMs - (long)SoonBefore.TotalMilliseconds;

    /// <summary>Cuando abre el check-in online del vuelo; null si no es un vuelo.</summary>
    public static long? CheckInMs(Booking booking) =>
        booking.Type == "flight" ? booking.StartUtcMs - Airlines.CheckInHoursFor(booking.Title) * 3_600_000L : null;

    /// <summary>
    /// Las reservas cuya víspera (20:00 del día anterior) es ahora y aún no han entrado en ningún resumen. Cada una dispara
    /// el resumen de su día para quienes la ven.
    /// </summary>
    public static IReadOnlyList<Booking> EveDue(IEnumerable<Booking> bookings, long nowMs, ISet<(Guid BookingId, string Kind, long StartUtcMs)> alreadySent)
    {
        var window = (long)Window.TotalMilliseconds;
        return bookings
            .Where(b => b.DeletedAtMs is null && b.StartUtcMs >= nowMs)
            .Where(b => EveMs(b) is { } eve && nowMs >= eve && nowMs < eve + window)
            .Where(b => !alreadySent.Contains((b.Id, Eve, b.StartUtcMs)))
            .ToList();
    }

    /// <summary>Lo de un día para una persona: lo que empieza, las salidas de hotel y dónde se duerme.</summary>
    public sealed record DayPlan(string Date, IReadOnlyList<Booking> Starting, IReadOnlyList<Booking> CheckOuts, Booking? Night);

    /// <summary>Junta, de las reservas que ve la persona, lo que toca ese día (fecha local de cada reserva).</summary>
    public static DayPlan PlanFor(IEnumerable<Booking> visible, string date)
    {
        var alive = visible.Where(b => b.DeletedAtMs is null).ToList();
        var starting = alive.Where(b => b.StartLocal[..10] == date).OrderBy(b => b.StartUtcMs).ToList();
        var hotels = alive.Where(b => b.Type == "hotel").ToList();
        var checkOuts = hotels.Where(h => h.EndLocal is { Length: >= 16 } end && end[..10] == date && h.StartLocal[..10] != date).OrderBy(h => h.EndLocal).ToList();
        var night = hotels
            .Where(h => string.CompareOrdinal(h.StartLocal[..10], date) <= 0 && string.CompareOrdinal(date, h.EndLocal?[..10] ?? h.StartLocal[..10]) < 0)
            .OrderBy(h => h.StartUtcMs)
            .LastOrDefault();
        return new DayPlan(date, starting, checkOuts, night);
    }

    /// <summary>Horas antes de un vuelo a las que conviene estar en el aeropuerto (lo que suelen pedir las aerolíneas).</summary>
    public const int AirportHoursBefore = 2;

    private static readonly Dictionary<string, string> TypeIcons = new()
    {
        ["flight"] = "✈️", ["train"] = "🚆", ["hotel"] = "🏨", ["car"] = "🚗", ["ticket"] = "🎟️", ["other"] = "📌",
    };

    // A mano, para no depender de que el servidor tenga los datos de idioma (ICU).
    private static readonly string[] Weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    private static readonly string[] Months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    /// <summary>
    /// «Mañana, viernes 9 de octubre» con una línea por cosa: el tiempo, cada reserva con su hora (los vuelos, con la hora
    /// a la que estar en el aeropuerto), las salidas de hotel y dónde se duerme.
    /// </summary>
    public static PushMessage SummaryMessage(DayPlan plan, string? weatherLine)
    {
        var date = DateTime.ParseExact(plan.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var day = $"{Weekdays[(int)date.DayOfWeek]} {date.Day} de {Months[date.Month - 1]}";
        var lines = new List<string>();
        if (weatherLine is not null)
        {
            lines.Add(weatherLine);
        }

        foreach (var hotel in plan.CheckOuts)
        {
            lines.Add($"{hotel.EndLocal![11..16]} 🧳 Salida de {HotelName(hotel)}");
        }

        foreach (var booking in plan.Starting)
        {
            var line = $"{booking.StartLocal[11..16]} {TypeIcons.GetValueOrDefault(booking.Type, "📌")} {(booking.Type == "hotel" ? HotelName(booking) : booking.Title)}";
            if (booking.Type == "flight")
            {
                var airport = DateTime.ParseExact(booking.StartLocal[..16], "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture).AddHours(-AirportHoursBefore);
                line += $" (en el aeropuerto a las {airport:HH:mm})";
            }

            lines.Add(line);
        }

        if (plan.Night is not null && !plan.Starting.Contains(plan.Night))
        {
            lines.Add($"🛏️ Noche en {HotelName(plan.Night)}");
        }

        var first = plan.Starting.FirstOrDefault() ?? plan.CheckOuts.FirstOrDefault();
        var url = first is null ? "/" : $"/trips/{first.TripId}";
        return new PushMessage($"Mañana, {day}", string.Join("\n", lines), url, $"eve-{plan.Date}");
    }

    private static string HotelName(Booking hotel) => string.IsNullOrWhiteSpace(hotel.StartPlace) ? hotel.Title : hotel.StartPlace;

    /// <summary>Los avisos que tocan ahora y no se han enviado aún para esa hora de salida.</summary>
    public static IReadOnlyList<DueReminder> Due(IEnumerable<Booking> bookings, long nowMs, ISet<(Guid BookingId, string Kind, long StartUtcMs)> alreadySent)
    {
        var due = new List<DueReminder>();
        var window = (long)Window.TotalMilliseconds;
        foreach (var booking in bookings)
        {
            if (booking.DeletedAtMs is not null || booking.StartUtcMs < nowMs)
            {
                continue;
            }

            var checkIn = CheckInMs(booking);
            if (checkIn is not null && nowMs >= checkIn && nowMs < checkIn + window && !alreadySent.Contains((booking.Id, CheckIn, booking.StartUtcMs)))
            {
                due.Add(new DueReminder(booking, CheckIn, checkIn.Value, CheckInMessage(booking)));
            }

            var soon = SoonMs(booking);
            if (nowMs >= soon && nowMs < soon + window && !alreadySent.Contains((booking.Id, Soon, booking.StartUtcMs)))
            {
                due.Add(new DueReminder(booking, Soon, soon, SoonMessage(booking)));
            }
        }

        return due;
    }

    public static PushMessage SoonMessage(Booking booking) =>
        new($"Hoy a las {booking.StartLocal[11..16]}: {Label(booking)}", $"{booking.Title}{Place(booking)}. Toca para abrir la reserva y su QR.", $"/bookings/{booking.Id}", $"soon-{booking.Id}");

    public static PushMessage CheckInMessage(Booking booking) =>
        new(
            $"Check-in abierto: {booking.Title}",
            "Ya puedes hacer el check-in online y elegir o cambiar asiento." + (BaggageOf(booking.Notes) is { } bags ? $" Equipaje: {bags}." : "") + " Toca para abrir la reserva.",
            $"/bookings/{booking.Id}",
            $"checkin-{booking.Id}");

    /// <summary>El tramo «Equipaje: …» de las notas (lo pone la IA al leer la reserva, o se apunta en la app).</summary>
    public static string? BaggageOf(string? notes) =>
        (notes ?? "")
            .Split([" · ", "\n"], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(s => s.StartsWith("Equipaje:", StringComparison.OrdinalIgnoreCase))
            .Select(s => s["Equipaje:".Length..].Trim().TrimEnd('.'))
            .FirstOrDefault(s => s.Length > 0);

    public static PushMessage ChangeMessage(Booking booking) =>
        new($"Reserva modificada: {booking.Title}", (booking.ChangeNote ?? "Hay cambios en esta reserva.").Replace("\n", " "), $"/bookings/{booking.Id}", $"change-{booking.Id}");

    private static string Label(Booking booking) => TypeLabels.GetValueOrDefault(booking.Type, "Reserva");

    private static string Place(Booking booking) => string.IsNullOrEmpty(booking.StartPlace) ? "" : $" · {booking.StartPlace}";
}
