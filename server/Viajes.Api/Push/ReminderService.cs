using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;
using Viajes.Api.Weather;

namespace Viajes.Api.Push;

/// <summary>Cada cinco minutos mira qué avisos tocan y los envía a los dispositivos del hogar de cada reserva.</summary>
public sealed class ReminderService(IServiceProvider services, IPushSender sender, ILogger<ReminderService> log) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!sender.IsConfigured)
        {
            log.LogInformation("Avisos push desactivados: faltan las claves VAPID.");
            return;
        }

        // Un primer respiro para no competir con las migraciones al arrancar.
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken).ContinueWith(_ => { }, TaskScheduler.Default);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Fallo al enviar avisos.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var push = scope.ServiceProvider.GetRequiredService<PushService>();
        var access = scope.ServiceProvider.GetRequiredService<Access.AccessService>();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Solo reservas de los próximos 8 días: el aviso más temprano es el check-in de Vueling, 7 días antes.
        var horizon = now + 8 * 24 * 3_600_000L;
        var bookings = await db.Bookings
            .Where(b => b.DeletedAtMs == null && b.StartUtcMs >= now && b.StartUtcMs <= horizon)
            .ToListAsync(ct);
        if (bookings.Count == 0)
        {
            return 0;
        }

        var ids = bookings.Select(b => b.Id).ToList();
        var sent = (await db.ReminderLogs.Where(l => ids.Contains(l.BookingId)).ToListAsync(ct))
            .Select(l => (l.BookingId, l.Kind, l.StartUtcMs))
            .ToHashSet();
        var delivered = await SendSummariesAsync(scope.ServiceProvider, Reminders.EveDue(bookings, now, sent), sent, now, ct);
        var due = Reminders.Due(bookings, now, sent);
        foreach (var reminder in due)
        {
            // Solo a quienes pueden ver la reserva (el hogar, o su creador y quien administra).
            var audience = await access.BookingAudience(reminder.Booking);
            if (audience.Count == 0)
            {
                continue;
            }

            delivered += await push.SendToUsersAsync(audience, reminder.Message, ct);
            db.ReminderLogs.Add(new ReminderLog { BookingId = reminder.Booking.Id, Kind = reminder.Kind, StartUtcMs = reminder.Booking.StartUtcMs, SentMs = now });
            await db.SaveChangesAsync(ct);
        }

        return delivered;
    }

    /// <summary>
    /// La víspera, un único aviso por persona y día con todo lo de mañana (y el tiempo), en vez de uno por reserva. Las
    /// reservas que entran en el resumen quedan apuntadas para no repetirlo cuando llegue su propia víspera.
    /// </summary>
    private async Task<int> SendSummariesAsync(IServiceProvider provider, IReadOnlyList<Booking> triggers, ISet<(Guid BookingId, string Kind, long StartUtcMs)> sent, long now, CancellationToken ct)
    {
        if (triggers.Count == 0)
        {
            return 0;
        }

        var db = provider.GetRequiredService<AppDbContext>();
        var push = provider.GetRequiredService<PushService>();
        var access = provider.GetRequiredService<Access.AccessService>();
        var weather = provider.GetRequiredService<WeatherService>();

        // Quién recibe el resumen de qué día.
        var targets = new HashSet<(string UserId, string Date)>();
        foreach (var trigger in triggers)
        {
            foreach (var userId in await access.BookingAudience(trigger))
            {
                targets.Add((userId, trigger.StartLocal[..10]));
            }
        }

        var delivered = 0;
        var included = new Dictionary<Guid, Booking>();
        var notified = new HashSet<(string UserId, string Date)>();
        var weatherCache = new Dictionary<(Guid TripId, string Date), string?>();
        var from = now - 60L * 24 * 3_600_000;
        var to = now + 3L * 24 * 3_600_000;
        foreach (var (userId, date) in targets)
        {
            var hidden = await db.BookingHides.Where(h => h.UserId == userId).Select(h => h.BookingId).ToListAsync(ct);
            var visible = await access.VisibleBookings(userId)
                .Where(b => b.DeletedAtMs == null && b.StartUtcMs >= from && b.StartUtcMs <= to && !hidden.Contains(b.Id))
                .ToListAsync(ct);
            var plan = Reminders.PlanFor(visible, date);
            if (plan.Starting.Count == 0)
            {
                continue;
            }

            var tripId = plan.Starting[0].TripId;
            if (!weatherCache.TryGetValue((tripId, date), out var line))
            {
                line = await WeatherLineAsync(db, weather, tripId, date, visible, ct);
                weatherCache[(tripId, date)] = line;
            }

            delivered += await push.SendToUserAsync(userId, Reminders.SummaryMessage(plan, line), ct);
            notified.Add((userId, date));
            foreach (var booking in plan.Starting)
            {
                included[booking.Id] = booking;
            }
        }

        // Se apunta cada reserva cuyo público entero ya tiene su resumen; las demás dispararán el suyo en su víspera.
        foreach (var booking in included.Values)
        {
            var audience = await access.BookingAudience(booking);
            if (!sent.Contains((booking.Id, Reminders.Eve, booking.StartUtcMs)) && audience.All(userId => notified.Contains((userId, booking.StartLocal[..10]))))
            {
                db.ReminderLogs.Add(new ReminderLog { BookingId = booking.Id, Kind = Reminders.Eve, StartUtcMs = booking.StartUtcMs, SentMs = now });
            }
        }

        await db.SaveChangesAsync(ct);
        return delivered;
    }

    private async Task<string?> WeatherLineAsync(AppDbContext db, WeatherService weather, Guid tripId, string date, List<Booking> visible, CancellationToken ct)
    {
        try
        {
            var trip = await db.Trips.FirstOrDefaultAsync(t => t.Id == tripId, ct);
            if (trip is null)
            {
                return null;
            }

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(20));
            var days = await weather.ForTripAsync(trip, visible.Where(b => b.TripId == tripId).ToList(), timeout.Token);
            var day = days.FirstOrDefault(d => d.Date == date);
            return day is null ? null : WeatherCodes.Line(day);
        }
        catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            log.LogWarning("Resumen sin el tiempo: {Error}", e.Message);
            return null;
        }
    }
}
