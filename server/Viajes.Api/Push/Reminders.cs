using System.Globalization;
using Viajes.Api.Data;
using Viajes.Api.Trips;

namespace Viajes.Api.Push;

/// <summary>Un aviso que toca enviar para una reserva.</summary>
public sealed record DueReminder(Booking Booking, string Kind, long DueMs, PushMessage Message);

/// <summary>
/// Reglas de los recordatorios, sin base de datos ni red, para poder probarlas:
/// la víspera a las 20:00 (hora del lugar de salida) y tres horas antes de la salida.
/// Cada aviso se envía una vez por reserva y hora de salida; si la hora cambia, vuelve a tocar.
/// </summary>
public static class Reminders
{
    public const string Eve = "eve";
    public const string Soon = "soon";
    public const string Change = "change";

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

            var eve = EveMs(booking);
            if (eve is not null && nowMs >= eve && nowMs < eve + window && !alreadySent.Contains((booking.Id, Eve, booking.StartUtcMs)))
            {
                due.Add(new DueReminder(booking, Eve, eve.Value, EveMessage(booking)));
            }

            var soon = SoonMs(booking);
            if (nowMs >= soon && nowMs < soon + window && !alreadySent.Contains((booking.Id, Soon, booking.StartUtcMs)))
            {
                due.Add(new DueReminder(booking, Soon, soon, SoonMessage(booking)));
            }
        }

        return due;
    }

    public static PushMessage EveMessage(Booking booking) =>
        new($"Mañana: {Label(booking)}", $"{booking.Title} a las {booking.StartLocal[11..16]}{Place(booking)}", $"/bookings/{booking.Id}", $"eve-{booking.Id}");

    public static PushMessage SoonMessage(Booking booking) =>
        new($"Hoy a las {booking.StartLocal[11..16]}: {Label(booking)}", $"{booking.Title}{Place(booking)}. Toca para abrir la reserva y su QR.", $"/bookings/{booking.Id}", $"soon-{booking.Id}");

    public static PushMessage ChangeMessage(Booking booking) =>
        new($"Reserva modificada: {booking.Title}", (booking.ChangeNote ?? "Hay cambios en esta reserva.").Replace("\n", " "), $"/bookings/{booking.Id}", $"change-{booking.Id}");

    private static string Label(Booking booking) => TypeLabels.GetValueOrDefault(booking.Type, "Reserva");

    private static string Place(Booking booking) => string.IsNullOrEmpty(booking.StartPlace) ? "" : $" · {booking.StartPlace}";
}
