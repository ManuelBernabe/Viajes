namespace Viajes.Api.Data;

/// <summary>
/// Toda fila que sincronizan los móviles: cada alta, edición o borrado lógico recibe una <see cref="Version"/>
/// nueva del contador global (lo hace <see cref="VersionInterceptor"/>, en un único sitio).
/// </summary>
public interface IVersioned
{
    long Version { get; set; }

    long? DeletedAtMs { get; set; }
}

public sealed class Household : IVersioned
{
    public Guid Id { get; set; }

    public required string Name { get; set; }

    public required string AdminUserId { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

public sealed class HouseholdMember : IVersioned
{
    public const string Admin = "admin";
    public const string Member = "member";

    public Guid HouseholdId { get; set; }

    public required string UserId { get; set; }

    public required string Role { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

public sealed class Trip : IVersioned
{
    public Guid Id { get; set; }

    public Guid HouseholdId { get; set; }

    public required string Title { get; set; }

    public string? Destination { get; set; }

    /// <summary>Fecha local «2026-10-12», sin hora ni zona.</summary>
    public string? StartDate { get; set; }

    public string? EndDate { get; set; }

    public required string CreatedBy { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

public sealed class Booking : IVersioned
{
    public static readonly IReadOnlySet<string> Types =
        new HashSet<string> { "flight", "hotel", "train", "car", "ticket", "other" };

    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    public required string Type { get; set; }

    public required string Title { get; set; }

    /// <summary>Hora local del lugar, «2026-10-12T10:05».</summary>
    public required string StartLocal { get; set; }

    /// <summary>Zona IANA del lugar, «Europe/Madrid».</summary>
    public required string StartTz { get; set; }

    public string? StartPlace { get; set; }

    public string? EndLocal { get; set; }

    public string? EndTz { get; set; }

    public string? EndPlace { get; set; }

    /// <summary>Derivado de <see cref="StartLocal"/> y <see cref="StartTz"/>: solo para ordenar y «lo siguiente».</summary>
    public long StartUtcMs { get; set; }

    public string? Reference { get; set; }

    public string? Address { get; set; }

    public string? Notes { get; set; }

    public required string CreatedBy { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

public sealed class Attachment : IVersioned
{
    public Guid Id { get; set; }

    public Guid BookingId { get; set; }

    public required string FileKey { get; set; }

    public required string Name { get; set; }

    public required string Mime { get; set; }

    public long Size { get; set; }

    public string? QrText { get; set; }

    public bool Uploaded { get; set; }

    public required string CreatedBy { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

/// <summary>Token personal para que el script de Gmail pueda crear borradores. Solo se guarda su hash.</summary>
public sealed class ImportToken
{
    public Guid Id { get; set; }

    public required string UserId { get; set; }

    public required string TokenHash { get; set; }

    public required string Label { get; set; }

    public long CreatedMs { get; set; }

    public long? RevokedMs { get; set; }

    public long? LastUsedMs { get; set; }
}

/// <summary>Un correo importado, a la espera de que alguien lo convierta en reserva o lo descarte.</summary>
public sealed class InboxItem : IVersioned
{
    public const string Pending = "pending";
    public const string Confirmed = "confirmed";
    public const string Discarded = "discarded";

    public Guid Id { get; set; }

    public Guid HouseholdId { get; set; }

    public required string ImportedBy { get; set; }

    public required string MessageId { get; set; }

    public required string FromAddress { get; set; }

    public required string Subject { get; set; }

    public long ReceivedMs { get; set; }

    public string? SuggestedType { get; set; }

    public string? SuggestedTitle { get; set; }

    public string? SuggestedStartLocal { get; set; }

    public string? SuggestedStartTz { get; set; }

    public string? SuggestedStartPlace { get; set; }

    public string? SuggestedEndLocal { get; set; }

    public string? SuggestedEndTz { get; set; }

    public string? SuggestedEndPlace { get; set; }

    public string? SuggestedReference { get; set; }

    public string? SuggestedAddress { get; set; }

    public string? BodyText { get; set; }

    public required string RawFileKey { get; set; }

    public required string Status { get; set; }

    public Guid? BookingId { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

public sealed class InboxAttachment
{
    public Guid Id { get; set; }

    public Guid InboxItemId { get; set; }

    public required string FileKey { get; set; }

    public required string Name { get; set; }

    public required string Mime { get; set; }

    public long Size { get; set; }

    /// <summary>Texto del código de barras cuando viene en un pase de Apple Wallet (.pkpass).</summary>
    public string? QrText { get; set; }
}

/// <summary>Una sola fila (Id = 1) con el último número de versión repartido.</summary>
public sealed class ChangeCounter
{
    public int Id { get; set; }

    public long Value { get; set; }
}
