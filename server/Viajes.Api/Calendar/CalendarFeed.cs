using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;
using Viajes.Api.Inbox;
using Viajes.Api.Trips;

namespace Viajes.Api.Calendar;

/// <summary>
/// Suscripción de calendario (iCalendar, RFC 5545): el calendario del iPhone (o Google) pide cada cierto tiempo
/// <c>/api/calendar/{clave}.ics</c> y ve los viajes como días completos y las reservas con su hora. La clave va en el enlace
/// porque los calendarios no mandan cabeceras; es personal y solo da las reservas que esa persona ve en la app.
/// </summary>
public static class CalendarFeed
{
    public static void MapCalendarFeed(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/calendar/{token}.ics", Feed);
    }

    public sealed record FeedTrip(Guid Id, string Title, string? Destination, string? StartDate, string? EndDate);

    public sealed record FeedBooking(
        Guid Id, Guid TripId, string Type, string Title, string StartLocal, string StartTz, string? StartPlace, string? EndLocal, string? EndTz,
        string? EndPlace, long StartUtcMs, string? Reference, string? Address, string? Notes, long Version);

    private static async Task<IResult> Feed(string token, HttpContext http, AppDbContext db, AccessService access, CancellationToken ct)
    {
        var hash = InboxEndpoints.Hash(token.Trim().ToLowerInvariant());
        var key = await db.ImportTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (key is null || key.RevokedMs is not null || key.Scope != ImportToken.CalendarScope)
        {
            return Results.NotFound();
        }

        var userId = key.UserId;
        var trips = await access.VisibleTrips(userId).Where(t => t.DeletedAtMs == null)
            .Select(t => new FeedTrip(t.Id, t.Title, t.Destination, t.StartDate, t.EndDate))
            .ToListAsync(ct);
        var tripIds = trips.Select(t => t.Id).ToHashSet();
        var bookings = (await access.VisibleBookings(userId).Where(b => b.DeletedAtMs == null)
            .Select(b => new FeedBooking(b.Id, b.TripId, b.Type, b.Title, b.StartLocal, b.StartTz, b.StartPlace, b.EndLocal, b.EndTz, b.EndPlace,
                b.StartUtcMs, b.Reference, b.Address, b.Notes, b.Version))
            .ToListAsync(ct))
            .Where(b => tripIds.Contains(b.TripId))
            .ToList();

        // Último uso, como mucho una vez por hora (el calendario pregunta a menudo).
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (key.LastUsedMs is null || now - key.LastUsedMs > 3_600_000)
        {
            key.LastUsedMs = now;
            await db.SaveChangesAsync(ct);
        }

        var appUrl = $"{http.Request.Scheme}://{http.Request.Host}";
        var body = Build(trips, bookings, appUrl, DateTimeOffset.UtcNow);
        http.Response.Headers.CacheControl = "private, max-age=900";
        return Results.Text(body, "text/calendar; charset=utf-8");
    }

    private static readonly Dictionary<string, string> Icons = new()
    {
        ["flight"] = "✈️",
        ["train"] = "🚆",
        ["hotel"] = "🏨",
        ["car"] = "🚗",
        ["ticket"] = "🎟️",
        ["other"] = "📌",
    };

    /// <summary>El calendario entero. Público para los tests.</summary>
    public static string Build(IReadOnlyList<FeedTrip> trips, IReadOnlyList<FeedBooking> bookings, string appUrl, DateTimeOffset now)
    {
        var stamp = now.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var lines = new List<string>
        {
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Viajes//Calendario//ES",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:Viajes",
            "X-WR-CALDESC:Viajes y reservas",
            "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
            "X-PUBLISHED-TTL:PT1H",
        };
        var titles = trips.ToDictionary(t => t.Id, t => t.Title);

        foreach (var trip in trips.Where(t => IsDate(t.StartDate)))
        {
            var end = IsDate(trip.EndDate) && string.CompareOrdinal(trip.EndDate, trip.StartDate) >= 0 ? trip.EndDate! : trip.StartDate!;
            lines.Add("BEGIN:VEVENT");
            lines.Add($"UID:trip-{trip.Id}@viajes");
            lines.Add($"DTSTAMP:{stamp}");
            lines.Add($"DTSTART;VALUE=DATE:{Compact(trip.StartDate!)}");
            lines.Add($"DTEND;VALUE=DATE:{Compact(NextDay(end))}");
            lines.Add($"SUMMARY:{Escape($"🧳 {trip.Title}")}");
            if (!string.IsNullOrWhiteSpace(trip.Destination))
            {
                lines.Add($"LOCATION:{Escape(trip.Destination)}");
            }

            lines.Add($"URL:{appUrl}/trips/{trip.Id}");
            lines.Add("TRANSP:TRANSPARENT");
            lines.Add("END:VEVENT");
        }

        foreach (var booking in bookings.OrderBy(b => b.StartUtcMs))
        {
            lines.Add("BEGIN:VEVENT");
            lines.Add($"UID:booking-{booking.Id}@viajes");
            lines.Add($"DTSTAMP:{stamp}");
            lines.Add($"SEQUENCE:{Math.Min(booking.Version, int.MaxValue)}");
            var allDay = booking.Type is "hotel" or "car" && booking.EndLocal is not null && booking.EndLocal[..10] != booking.StartLocal[..10];
            if (allDay)
            {
                // Hotel o coche de varios días: noche a noche (del día de entrada al de salida, sin incluirlo).
                lines.Add($"DTSTART;VALUE=DATE:{Compact(booking.StartLocal[..10])}");
                lines.Add($"DTEND;VALUE=DATE:{Compact(booking.EndLocal![..10])}");
                lines.Add("TRANSP:TRANSPARENT");
            }
            else
            {
                var endMs = EndUtcMs(booking) ?? booking.StartUtcMs + DefaultLength(booking.Type);
                lines.Add($"DTSTART:{Utc(booking.StartUtcMs)}");
                lines.Add($"DTEND:{Utc(Math.Max(endMs, booking.StartUtcMs + 15 * 60_000))}");
            }

            var icon = Icons.GetValueOrDefault(booking.Type, "📌");
            lines.Add($"SUMMARY:{Escape($"{icon} {booking.Title}")}");
            var location = booking.Type is "flight" or "train" && booking.StartPlace is not null && booking.EndPlace is not null
                ? $"{booking.StartPlace} → {booking.EndPlace}"
                : booking.Address ?? booking.StartPlace;
            if (!string.IsNullOrWhiteSpace(location))
            {
                lines.Add($"LOCATION:{Escape(location)}");
            }

            var description = new StringBuilder();
            if (titles.TryGetValue(booking.TripId, out var tripTitle))
            {
                description.Append("Viaje: ").Append(tripTitle).Append('\n');
            }

            if (!string.IsNullOrWhiteSpace(booking.Reference))
            {
                description.Append("Localizador: ").Append(booking.Reference).Append('\n');
            }

            if (!string.IsNullOrWhiteSpace(booking.Notes))
            {
                description.Append(booking.Notes).Append('\n');
            }

            description.Append(appUrl).Append("/bookings/").Append(booking.Id);
            lines.Add($"DESCRIPTION:{Escape(description.ToString())}");
            lines.Add($"URL:{appUrl}/bookings/{booking.Id}");
            lines.Add("END:VEVENT");
        }

        lines.Add("END:VCALENDAR");
        var output = new StringBuilder();
        foreach (var line in lines)
        {
            Fold(output, line);
        }

        return output.ToString();
    }

    private static long? EndUtcMs(FeedBooking booking)
    {
        if (booking.EndLocal is null)
        {
            return null;
        }

        try
        {
            return LocalTime.ToUtcMs(booking.EndLocal, booking.EndTz ?? booking.StartTz);
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    /// <summary>Sin hora de llegada: un vuelo o un tren ocupa 2 h en el calendario; lo demás, 1 h.</summary>
    private static long DefaultLength(string type) => type is "flight" or "train" ? 2 * 3_600_000L : 3_600_000L;

    private static bool IsDate(string? date) =>
        date is not null && DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static string Compact(string date) => date.Replace("-", "");

    private static string NextDay(string date) =>
        DateOnly.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Utc(long ms) =>
        DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);

    /// <summary>RFC 5545: barra, punto y coma y coma se escapan; los saltos de línea pasan a «\n».</summary>
    public static string Escape(string text) =>
        text.Replace("\\", "\\\\").Replace(";", "\;").Replace(",", "\\,").Replace("\r\n", "\n").Replace("\r", "\n").Replace("\n", "\\n");

    /// <summary>Líneas de como mucho 75 bytes; las siguientes empiezan con un espacio. Sin partir un carácter UTF-8.</summary>
    private static void Fold(StringBuilder output, string line)
    {
        var bytes = 0;
        var limit = 75;
        var enumerator = StringInfo.GetTextElementEnumerator(line);
        while (enumerator.MoveNext())
        {
            var element = enumerator.GetTextElement();
            var size = Encoding.UTF8.GetByteCount(element);
            if (bytes + size > limit)
            {
                output.Append("\r\n ");
                bytes = 1;
                limit = 75;
            }

            output.Append(element);
            bytes += size;
        }

        output.Append("\r\n");
    }
}
