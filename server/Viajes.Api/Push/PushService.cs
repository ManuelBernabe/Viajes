using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;

namespace Viajes.Api.Push;

/// <summary>Envía un mensaje a todos los dispositivos de los miembros de un hogar y limpia las suscripciones muertas.</summary>
public sealed class PushService(AppDbContext db, IPushSender sender, ILogger<PushService> log)
{
    public async Task<int> SendToHouseholdAsync(Guid householdId, PushMessage message, CancellationToken ct)
    {
        if (!sender.IsConfigured)
        {
            return 0;
        }

        var userIds = await db.HouseholdMembers
            .Where(m => m.HouseholdId == householdId && m.DeletedAtMs == null)
            .Select(m => m.UserId)
            .ToListAsync(ct);
        var subscriptions = await db.PushSubscriptions.Where(s => userIds.Contains(s.UserId)).ToListAsync(ct);
        return await SendAsync(subscriptions, message, ct);
    }

    public async Task<int> SendToUserAsync(string userId, PushMessage message, CancellationToken ct)
    {
        if (!sender.IsConfigured)
        {
            return 0;
        }

        var subscriptions = await db.PushSubscriptions.Where(s => s.UserId == userId).ToListAsync(ct);
        return await SendAsync(subscriptions, message, ct);
    }

    private async Task<int> SendAsync(List<PushSubscription> subscriptions, PushMessage message, CancellationToken ct)
    {
        var sent = 0;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var subscription in subscriptions)
        {
            var result = await sender.SendAsync(subscription, message, ct);
            switch (result)
            {
                case PushResult.Sent:
                    sent++;
                    subscription.LastSentMs = now;
                    subscription.LastError = null;
                    break;
                case PushResult.Gone:
                    db.PushSubscriptions.Remove(subscription);
                    break;
                default:
                    subscription.LastError = $"fallo el {DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm} UTC";
                    break;
            }
        }

        await db.SaveChangesAsync(ct);
        log.LogInformation("Push «{Titulo}»: {Enviados} de {Total} dispositivos.", message.Title, sent, subscriptions.Count);
        return sent;
    }
}
