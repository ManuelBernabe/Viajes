using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;

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

        // Solo reservas de las próximas 48 horas: las demás no pueden tener avisos pendientes.
        var horizon = now + 48 * 3_600_000L;
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
        var due = Reminders.Due(bookings, now, sent);
        var delivered = 0;
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
}
