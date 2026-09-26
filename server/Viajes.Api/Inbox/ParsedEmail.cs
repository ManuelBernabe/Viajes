namespace Viajes.Api.Inbox;

/// <summary>Lo que se propone rellenar en la reserva. Todo opcional: el correo puede no traer nada estructurado.</summary>
public sealed class Suggestion
{
    public string? Type { get; set; }

    public string? Title { get; set; }

    /// <summary>Hora local «2026-10-12T10:05» (sin la zona, que el correo no suele indicar con nombre).</summary>
    public string? StartLocal { get; set; }

    public string? StartTz { get; set; }

    public string? StartPlace { get; set; }

    public string? EndLocal { get; set; }

    public string? EndTz { get; set; }

    public string? EndPlace { get; set; }

    public string? Reference { get; set; }

    public string? Address { get; set; }

    public string? Notes { get; set; }

    public bool IsEmpty => Type is null && Title is null && StartLocal is null && Reference is null;

    /// <summary>Completa los huecos con otra sugerencia, sin pisar lo que ya hay.</summary>
    public void FillFrom(Suggestion other)
    {
        Type ??= other.Type;
        Title ??= other.Title;
        StartLocal ??= other.StartLocal;
        StartTz ??= other.StartTz;
        StartPlace ??= other.StartPlace;
        EndLocal ??= other.EndLocal;
        EndTz ??= other.EndTz;
        EndPlace ??= other.EndPlace;
        Reference ??= other.Reference;
        Address ??= other.Address;
        Notes ??= other.Notes;
    }
}

public sealed record ParsedAttachment(string Name, string Mime, byte[] Bytes, string? QrText);

public enum GmailAuth
{
    /// <summary>Sin cabecera de Gmail: correo que no salió de Google (enviado desde la propia cuenta).</summary>
    None,
    Pass,
    Fail,
}

public sealed class ParsedEmail
{
    public required string MessageId { get; init; }

    public required string From { get; init; }

    public required string Subject { get; init; }

    public long ReceivedMs { get; init; }

    public string? BodyText { get; init; }

    /// <summary>Qué dijo Gmail del remitente (cabecera Authentication-Results de mx.google.com).</summary>
    public GmailAuth GmailAuth { get; init; }

    public bool GmailAuthenticated => GmailAuth == GmailAuth.Pass;

    /// <summary>Propuesta de campos; la importación la sustituye por la de la IA cuando la hay.</summary>
    public required Suggestion Suggestion { get; set; }

    public required IReadOnlyList<ParsedAttachment> Attachments { get; init; }
}
