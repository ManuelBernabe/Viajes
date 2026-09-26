using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;

namespace Viajes.Api.Push;

public static class PushEndpoints
{
    public sealed record SubscribeRequest(string Endpoint, Keys Keys);

    public sealed record Keys(string P256dh, string Auth);

    public sealed record UnsubscribeRequest(string Endpoint);

    public static IServiceCollection AddPush(this IServiceCollection services)
    {
        services.AddSingleton<IPushSender, WebPushSender>();
        services.AddScoped<PushService>();
        services.AddHostedService<ReminderService>();
        return services;
    }

    public static void MapPushEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/push").RequireAuthorization();
        group.MapGet("/public-key", (IPushSender sender) =>
            sender.IsConfigured
                ? Results.Ok(new { publicKey = sender.PublicKey })
                : Results.Problem("Los avisos no están configurados en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable));

        group.MapPost("/subscribe", async (SubscribeRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(body.Endpoint) || string.IsNullOrWhiteSpace(body.Keys?.P256dh) || string.IsNullOrWhiteSpace(body.Keys.Auth))
            {
                return Results.Problem("Suscripción incompleta.", statusCode: StatusCodes.Status400BadRequest);
            }

            var userId = users.GetUserId(principal)!;
            var existing = await db.PushSubscriptions.FirstOrDefaultAsync(s => s.Endpoint == body.Endpoint);
            if (existing is null)
            {
                db.PushSubscriptions.Add(new PushSubscription
                {
                    Id = Guid.NewGuid(), UserId = userId, Endpoint = body.Endpoint, P256dh = body.Keys.P256dh, Auth = body.Keys.Auth,
                    CreatedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                });
            }
            else
            {
                existing.UserId = userId;
                existing.P256dh = body.Keys.P256dh;
                existing.Auth = body.Keys.Auth;
                existing.LastError = null;
            }

            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/unsubscribe", async (UnsubscribeRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db) =>
        {
            var userId = users.GetUserId(principal)!;
            var existing = await db.PushSubscriptions.FirstOrDefaultAsync(s => s.Endpoint == body.Endpoint && s.UserId == userId);
            if (existing is not null)
            {
                db.PushSubscriptions.Remove(existing);
                await db.SaveChangesAsync();
            }

            return Results.NoContent();
        });

        group.MapGet("/status", async (ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db, IPushSender sender) =>
        {
            var userId = users.GetUserId(principal)!;
            var devices = await db.PushSubscriptions.CountAsync(s => s.UserId == userId);
            return Results.Ok(new { configured = sender.IsConfigured, devices });
        });

        // Un aviso de prueba a todos los dispositivos de quien lo pide. Con ?delay=10 se manda pasados diez
        // segundos, para poder cerrar la app y ver que el aviso llega con ella cerrada.
        group.MapPost("/test", async (int? delay, ClaimsPrincipal principal, UserManager<IdentityUser> users, PushService push, IServiceScopeFactory scopes, ILogger<PushService> log, CancellationToken ct) =>
        {
            var userId = users.GetUserId(principal)!;
            var message = new PushMessage("Viajes", "Los avisos funcionan en este móvil.", "/", "test");
            var seconds = Math.Clamp(delay ?? 0, 0, 60);
            if (seconds == 0)
            {
                return Results.Ok(new { sent = await push.SendToUserAsync(userId, message, ct) });
            }

            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromSeconds(seconds));
                try
                {
                    using var scope = scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<PushService>().SendToUserAsync(userId, message, CancellationToken.None);
                }
                catch (Exception e)
                {
                    log.LogWarning(e, "Fallo el aviso de prueba retardado.");
                }
            });
            return Results.Ok(new { sent = -1, delay = seconds });
        });
    }
}
