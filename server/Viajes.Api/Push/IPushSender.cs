namespace Viajes.Api.Push;

/// <summary>Lo que ve la persona: título, texto y a dónde lleva el toque.</summary>
public sealed record PushMessage(string Title, string Body, string Url, string Tag);

public enum PushResult
{
    Sent,
    /// <summary>El dispositivo ya no existe (404/410): hay que borrar la suscripción.</summary>
    Gone,
    Failed,
}

public interface IPushSender
{
    bool IsConfigured { get; }

    string? PublicKey { get; }

    Task<PushResult> SendAsync(Data.PushSubscription subscription, PushMessage message, CancellationToken ct);
}
