using Viajes.Api.Data;

namespace Viajes.Api.Trips;

public sealed record TripBody(string? Title, string? Destination, string? StartDate, string? EndDate);

public sealed record BookingBody(
    Guid TripId,
    string? Type,
    string? Title,
    string? StartLocal,
    string? StartTz,
    string? StartPlace,
    string? EndLocal,
    string? EndTz,
    string? EndPlace,
    string? Reference,
    string? Address,
    string? Notes,
    string? ChangeNote,
    string? Visibility = null,
    List<string>? SharedWith = null);

public sealed record PlaceBody(Guid TripId, string? Name, string? Category, string? Notes, string? Url, string? Address, bool Visited);

public sealed record AttachmentBody(Guid BookingId, string? Name, string? Mime, long Size, string? QrText);

public sealed record TripDto(
    Guid Id,
    string Title,
    string? Destination,
    string? StartDate,
    string? EndDate,
    string CreatedBy,
    long Version,
    long? DeletedAtMs)
{
    public static TripDto From(Trip t) =>
        new(t.Id, t.Title, t.Destination, t.StartDate, t.EndDate, t.CreatedBy, t.Version, t.DeletedAtMs);
}

public sealed record BookingDto(
    Guid Id,
    Guid TripId,
    string Type,
    string Title,
    string StartLocal,
    string StartTz,
    string? StartPlace,
    string? EndLocal,
    string? EndTz,
    string? EndPlace,
    long StartUtcMs,
    string? Reference,
    string? Address,
    string? Notes,
    string? ChangeNote,
    string Visibility,
    List<string> SharedWith,
    string CreatedBy,
    long Version,
    long? DeletedAtMs)
{
    public static BookingDto From(Booking b, IEnumerable<string>? sharedWith = null) => new(
        b.Id, b.TripId, b.Type, b.Title, b.StartLocal, b.StartTz, b.StartPlace, b.EndLocal, b.EndTz, b.EndPlace,
        b.StartUtcMs, b.Reference, b.Address, b.Notes, b.ChangeNote, b.Visibility, sharedWith?.ToList() ?? [], b.CreatedBy, b.Version, b.DeletedAtMs);
}

public sealed record AttachmentDto(
    Guid Id,
    Guid BookingId,
    string Name,
    string Mime,
    long Size,
    string? QrText,
    bool Uploaded,
    string CreatedBy,
    long Version,
    long? DeletedAtMs)
{
    public static AttachmentDto From(Attachment a) => new(
        a.Id, a.BookingId, a.Name, a.Mime, a.Size, a.QrText, a.Uploaded, a.CreatedBy, a.Version, a.DeletedAtMs);
}

public sealed record InboxAttachmentDto(Guid Id, string Name, string Mime, long Size, string? QrText);

public sealed record InboxItemDto(
    Guid Id,
    string FromAddress,
    string Subject,
    long ReceivedMs,
    string? SuggestedType,
    string? SuggestedTitle,
    string? SuggestedStartLocal,
    string? SuggestedStartTz,
    string? SuggestedStartPlace,
    string? SuggestedEndLocal,
    string? SuggestedEndTz,
    string? SuggestedEndPlace,
    string? SuggestedReference,
    string? SuggestedAddress,
    string? SuggestedNotes,
    string? BodyText,
    string Status,
    Guid? BookingId,
    IReadOnlyList<InboxAttachmentDto> Attachments,
    long Version,
    long? DeletedAtMs);

public sealed record PlaceDto(
    Guid Id,
    Guid TripId,
    string Name,
    string Category,
    string? Notes,
    string? Url,
    string? Address,
    bool Visited,
    string CreatedBy,
    long Version,
    long? DeletedAtMs)
{
    public static PlaceDto From(Place p) =>
        new(p.Id, p.TripId, p.Name, p.Category, p.Notes, p.Url, p.Address, p.Visited, p.CreatedBy, p.Version, p.DeletedAtMs);
}

public sealed record SyncResponse(
    long Version,
    IReadOnlyList<Guid> TripIds,
    /// <summary>Todas las reservas que la persona puede ver ahora: el móvil purga las que tenga y ya no estén (visibilidad retirada).</summary>
    IReadOnlyList<Guid> BookingIds,
    IReadOnlyList<TripDto> Trips,
    IReadOnlyList<BookingDto> Bookings,
    IReadOnlyList<AttachmentDto> Attachments,
    IReadOnlyList<InboxItemDto> Inbox,
    /// <summary>Lugares recomendados de los viajes visibles (con los borrados, para quitarlos del móvil).</summary>
    IReadOnlyList<PlaceDto> Places);
