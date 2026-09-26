using System.Net;
using System.Text.Json;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;

namespace Viajes.Api.Push;

/// <summary>
/// Envía por Web Push (VAPID, cifrado aes128gcm de RFC 8291, que es el que exige Apple).
/// Sin claves configuradas, no hace nada y lo dice.
/// </summary>
public sealed class WebPushSender : IPushSender
{
    private const int TimeToLiveSeconds = 6 * 3600;

    private readonly PushServiceClient? _client;
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
        _client = new PushServiceClient
        {
            DefaultAuthentication = new VapidAuthentication(publicKey, privateKey) { Subject = subject },
            DefaultTimeToLive = TimeToLiveSeconds,
        };
    }

    public bool IsConfigured => _client is not null;

    public string? PublicKey { get; }

    public async Task<PushResult> SendAsync(Data.PushSubscription subscription, PushMessage message, CancellationToken ct)
    {
        if (_client is null)
        {
            return PushResult.Failed;
        }

        var target = new Lib.Net.Http.WebPush.PushSubscription { Endpoint = subscription.Endpoint };
        target.SetKey(PushEncryptionKeyName.P256DH, subscription.P256dh);
        target.SetKey(PushEncryptionKeyName.Auth, subscription.Auth);
        var payload = JsonSerializer.Serialize(new { title = message.Title, body = message.Body, url = message.Url, tag = message.Tag });
        var push = new Lib.Net.Http.WebPush.PushMessage(payload)
        {
            TimeToLive = TimeToLiveSeconds,
            Urgency = PushMessageUrgency.High,
            Topic = message.Tag,
        };

        try
        {
            await _client.RequestPushMessageDeliveryAsync(target, push, ct);
            return PushResult.Sent;
        }
        catch (PushServiceClientException e) when (e.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            _log.LogInformation("Suscripción push caducada ({Codigo}).", (int)e.StatusCode);
            return PushResult.Gone;
        }
        catch (PushServiceClientException e)
        {
            _log.LogWarning("Web Push respondió {Codigo}: {Cuerpo}", (int)e.StatusCode, e.Body);
            return PushResult.Failed;
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // Un fallo al enviar no debe tumbar la petición ni el servicio de recordatorios.
            _log.LogWarning(e, "Web Push: no se pudo enviar.");
            return PushResult.Failed;
        }
    }
}
