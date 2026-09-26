using System.Net;
using System.Text.Json;
using WebPush;

namespace Viajes.Api.Push;

/// <summary>Envía por Web Push (VAPID). Sin claves configuradas, no hace nada y lo dice.</summary>
public sealed class WebPushSender : IPushSender
{
    private readonly WebPushClient? _client;
    private readonly ILogger<WebPushSender> _log;

    public WebPushSender(IConfiguration config, ILogger<WebPushSender> log)
    {
        _log = log;
        var publicKey = config["VAPID_PUBLIC_KEY"];
        var privateKey = config["VAPID_PRIVATE_KEY"];
        var subject = config["VAPID_SUBJECT"] ?? "mailto:viajes@example.com";
        if (string.IsNullOrWhiteSpace(publicKey) || string.IsNullOrWhiteSpace(privateKey))
        {
            return;
        }

        PublicKey = publicKey;
        _client = new WebPushClient();
        _client.SetVapidDetails(subject, publicKey, privateKey);
    }

    public bool IsConfigured => _client is not null;

    public string? PublicKey { get; }

    /// <summary>Opciones para WebPushClient: solo admite headers, gcmAPIKey, vapidDetails y TTL; la urgencia va como cabecera.</summary>
    public static Dictionary<string, object> Options() => new()
    {
        ["TTL"] = 6 * 3600,
        ["headers"] = new Dictionary<string, object> { ["Urgency"] = "high" },
    };

    public async Task<PushResult> SendAsync(Data.PushSubscription subscription, PushMessage message, CancellationToken ct)
    {
        if (_client is null)
        {
            return PushResult.Failed;
        }

        var payload = JsonSerializer.Serialize(new { title = message.Title, body = message.Body, url = message.Url, tag = message.Tag });
        try
        {
            await _client.SendNotificationAsync(
                new WebPush.PushSubscription(subscription.Endpoint, subscription.P256dh, subscription.Auth),
                payload,
                Options(),
                ct);
            return PushResult.Sent;
        }
        catch (WebPushException e) when (e.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            _log.LogInformation("Suscripción push caducada ({Codigo}).", (int)e.StatusCode);
            return PushResult.Gone;
        }
        catch (WebPushException e)
        {
            _log.LogWarning(e, "Web Push respondió {Codigo}.", (int)e.StatusCode);
            return PushResult.Failed;
        }
        catch (Exception e) when (e is HttpRequestException or ArgumentException or InvalidOperationException or TaskCanceledException)
        {
            // Un fallo al enviar no debe tumbar la petición ni el servicio de recordatorios.
            _log.LogWarning(e, "Web Push: no se pudo enviar.");
            return PushResult.Failed;
        }
    }
}
