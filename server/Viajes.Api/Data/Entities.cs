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

/// <summary>Un sitio que merece la pena en un viaje (para ver, comer, comprar…). Lo ve todo el hogar, como el viaje.</summary>
public sealed class Place : IVersioned
{
    public static readonly IReadOnlySet<string> Categories =
        new HashSet<string> { "see", "eat", "drink", "shop", "nature", "other" };

    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    public required string Name { get; set; }

    /// <summary>see (ver), eat (comer), drink (tomar algo), shop (compras), nature (naturaleza), other.</summary>
    public required string Category { get; set; }

    public string? Notes { get; set; }

    /// <summary>Enlace opcional: Google Maps, web del sitio, reseña…</summary>
    public string? Url { get; set; }

    public string? Address { get; set; }

    public bool Visited { get; set; }

    public required string CreatedBy { get; set; }

    /// <summary>Cuándo se apuntó (hora del servidor), para enseñar primero lo último añadido. 0 en los anteriores a este campo.</summary>
    public long CreatedAtMs { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

/// <summary>
/// Un documento de viaje de alguien del hogar: pasaporte, DNI, visado, seguro, vacuna, carné… Con su foto o PDF como
/// adjunto (el adjunto apunta al documento con <see cref="Attachment.BookingId"/>). Lo ve todo el hogar, salvo que quien lo
/// apunta lo deje solo para sí.
/// </summary>
public sealed class TravelDocument : IVersioned
{
    public static readonly IReadOnlySet<string> Kinds =
        new HashSet<string> { "passport", "id", "visa", "insurance", "vaccine", "license", "other" };

    public static readonly IReadOnlySet<string> Visibilities = new HashSet<string> { Booking.VisibleToHousehold, Booking.VisibleToCreator };

    public Guid Id { get; set; }

    public Guid HouseholdId { get; set; }

    /// <summary>De quién es («Paco», «Lucía»).</summary>
    public required string Person { get; set; }

    public required string Kind { get; set; }

    public string? Number { get; set; }

    /// <summary>País que lo expide o para el que vale (un visado, un seguro).</summary>
    public string? Country { get; set; }

    /// <summary>Fechas locales «2026-10-12».</summary>
    public string? IssuedDate { get; set; }

    public string? ExpiryDate { get; set; }

    public string? Notes { get; set; }

    public string Visibility { get; set; } = Booking.VisibleToHousehold;

    public required string CreatedBy { get; set; }

    public long Version { get; set; }

    public long? DeletedAtMs { get; set; }
}

/// <summary>
/// Una idea de sitio propuesta por la IA para un viaje. Se guarda para no tener que volver a pedirla: la lista de ideas se
/// queda en el viaje hasta que alguien la añade a «Lugares» o la descarta. No se sincroniza; se lee con la API.
/// </summary>
public sealed class PlaceIdea
{
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    public required string Name { get; set; }

    public required string Category { get; set; }

    public required string Description { get; set; }

    public string? Address { get; set; }

    /// <summary>País del sitio («Argentina», «Brasil»), para agrupar las ideas. Vacío si no se sabe; null si aún no se ha mirado.</summary>
    public string? Area { get; set; }

    public long CreatedAtMs { get; set; }

    /// <summary>Cuándo alguien la quitó de la lista. Se guarda igual, para no volver a proponerla.</summary>
    public long? DismissedAtMs { get; set; }
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

    /// <summary>Aviso visible («Modificada el 27/09 según correo: salida 14:35 → 16:10») hasta que alguien lo quita.</summary>
    public string? ChangeNote { get; set; }

    /// <summary>Todo el hogar la ve.</summary>
    public const string VisibleToHousehold = "household";

    /// <summary>Solo su creador y quien administra.</summary>
    public const string VisibleToCreator = "private";

    /// <summary>Su creador, quien administra y las personas de <see cref="BookingShare"/>.</summary>
    public const string VisibleToSome = "some";

    public static readonly IReadOnlySet<string> Visibilities = new HashSet<string> { VisibleToHousehold, VisibleToCreator, VisibleToSome };

    /// <summary>Quién ve la reserva (regla de Manuel, 27/09/2026): las de quien administra nacen para todo el hogar; las de un invitado, privadas.</summary>
    public string Visibility { get; set; } = VisibleToHousehold;

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
    /// <summary>Permite crear borradores desde el correo (script de Gmail).</summary>
    public const string ImportScope = "import";

    /// <summary>Permite descargar la copia de seguridad completa (script que la guarda en Drive).</summary>
    public const string BackupScope = "backup";

    /// <summary>Clave personal del atajo de iPhone «Enviar a Viajes»: solo crea borradores, como reenviar un correo.</summary>
    public const string ShareScope = "share";

    /// <summary>Suscripción al calendario (enlace .ics): personal, como la del atajo; solo lee las reservas que ve esa persona.</summary>
    public const string CalendarScope = "calendar";

    /// <summary>Las claves que cada persona crea y revoca para sí, sin ser administradora.</summary>
    public static bool IsPersonal(string? scope) => scope is ShareScope or CalendarScope;

    public Guid Id { get; set; }

    public string Scope { get; set; } = ImportScope;

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

    public string? SuggestedNotes { get; set; }

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

/// <summary>Persona concreta con la que se comparte una reserva de visibilidad «some».</summary>
/// <summary>
/// Una reserva que alguien ha ocultado de sus listas (quien administra ve las de todo el hogar y puede no querer verlas).
/// Es de cada persona: a los demás no les cambia nada. Tampoco le llegan avisos de ella ni sale en su calendario.
/// </summary>
public sealed class BookingHide
{
    public Guid BookingId { get; set; }

    public required string UserId { get; set; }

    public long CreatedMs { get; set; }
}

public sealed class BookingShare
{
    public Guid BookingId { get; set; }

    public required string UserId { get; set; }
}

/// <summary>Enlace de un solo uso para unirse a un hogar; en la base solo queda el hash del token.</summary>
public sealed class Invitation
{
    public Guid Id { get; set; }

    public Guid HouseholdId { get; set; }

    public required string TokenHash { get; set; }

    public required string CreatedBy { get; set; }

    public long CreatedMs { get; set; }

    public long ExpiresMs { get; set; }

    public long? UsedMs { get; set; }

    public string? UsedBy { get; set; }

    public long? RevokedMs { get; set; }
}

/// <summary>Suscripción Web Push de un dispositivo (app instalada) de un usuario.</summary>
public sealed class PushSubscription
{
    public Guid Id { get; set; }

    public required string UserId { get; set; }

    public required string Endpoint { get; set; }

    public required string P256dh { get; set; }

    public required string Auth { get; set; }

    public long CreatedMs { get; set; }

    public long? LastSentMs { get; set; }

    public string? LastError { get; set; }
}

/// <summary>Aviso ya enviado para una reserva: no se repite salvo que cambie la hora de salida.</summary>
public sealed class ReminderLog
{
    public Guid BookingId { get; set; }

    /// <summary>«eve» (víspera), «soon» (poco antes) o «change» (modificación).</summary>
    public required string Kind { get; set; }

    public long StartUtcMs { get; set; }

    public long SentMs { get; set; }
}

/// <summary>Una sola fila (Id = 1) con el último número de versión repartido.</summary>
public sealed class ChangeCounter
{
    public int Id { get; set; }

    public long Value { get; set; }
}
