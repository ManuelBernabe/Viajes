using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;

namespace Viajes.Api.Access;

/// <summary>
/// El único sitio que decide qué ve cada usuario. Todas las consultas de viajes, reservas y adjuntos
/// pasan por aquí y llegan ya filtradas por el hogar del que la persona es miembro.
/// Incluye las filas borradas lógicamente: la sincronización las necesita; quien no, filtra <c>DeletedAtMs == null</c>.
/// </summary>
public sealed class AccessService(AppDbContext db)
{
    public const string DefaultHouseholdName = "Casa";

    public Task<Guid?> HouseholdOf(string userId) =>
        db.HouseholdMembers
            .Where(m => m.UserId == userId && m.DeletedAtMs == null)
            .Select(m => (Guid?)m.HouseholdId)
            .FirstOrDefaultAsync();

    /// <summary>Si la persona administra su hogar. Los tokens y la gestión de miembros son solo para quien administra.</summary>
    public async Task<bool> IsAdmin(string userId)
    {
        var householdId = await EnsureHousehold(userId);
        return await db.HouseholdMembers.AnyAsync(m =>
            m.HouseholdId == householdId && m.UserId == userId && m.Role == HouseholdMember.Admin && m.DeletedAtMs == null);
    }

    /// <summary>Cada cuenta tiene un hogar; a las anteriores a este plan se les crea al iniciar sesión.</summary>
    public async Task<Guid> EnsureHousehold(string userId)
    {
        var existing = await HouseholdOf(userId);
        if (existing is not null)
        {
            return existing.Value;
        }

        var household = new Household { Id = Guid.NewGuid(), Name = DefaultHouseholdName, AdminUserId = userId };
        db.Households.Add(household);
        db.HouseholdMembers.Add(new HouseholdMember
        {
            HouseholdId = household.Id,
            UserId = userId,
            Role = HouseholdMember.Admin,
        });
        await db.SaveChangesAsync();
        return household.Id;
    }

    public IQueryable<Trip> VisibleTrips(string userId) =>
        from trip in db.Trips
        join member in db.HouseholdMembers on trip.HouseholdId equals member.HouseholdId
        where member.UserId == userId && member.DeletedAtMs == null
        select trip;

    /// <summary>Los lugares los ve quien ve el viaje.</summary>
    public IQueryable<Place> VisiblePlaces(string userId) =>
        from place in db.Places
        join trip in VisibleTrips(userId) on place.TripId equals trip.Id
        select place;

    public Task<Trip?> VisibleTrip(string userId, Guid tripId) =>
        VisibleTrips(userId).FirstOrDefaultAsync(t => t.Id == tripId);

    /// <summary>
    /// Regla de las reservas (decidida por Manuel el 27/09/2026): quien administra el hogar ve todas; una reserva la ven además
    /// su creador, todo el hogar si es «household», y las personas concretas con las que se comparte si es «some».
    /// </summary>
    public IQueryable<Booking> VisibleBookings(string userId) =>
        from booking in db.Bookings
        join trip in db.Trips on booking.TripId equals trip.Id
        join member in db.HouseholdMembers on trip.HouseholdId equals member.HouseholdId
        where member.UserId == userId && member.DeletedAtMs == null
        where member.Role == HouseholdMember.Admin
            || booking.CreatedBy == userId
            || booking.Visibility == Booking.VisibleToHousehold
            || (booking.Visibility == Booking.VisibleToSome && db.BookingShares.Any(s => s.BookingId == booking.Id && s.UserId == userId))
        select booking;

    /// <summary>Quiénes pueden ver una reserva (para los avisos), según la misma regla.</summary>
    public async Task<List<string>> BookingAudience(Booking booking)
    {
        var trip = await db.Trips.FirstOrDefaultAsync(t => t.Id == booking.TripId);
        if (trip is null)
        {
            return [];
        }

        var members = await db.HouseholdMembers.Where(m => m.HouseholdId == trip.HouseholdId && m.DeletedAtMs == null).ToListAsync();
        var sharedWith = booking.Visibility == Booking.VisibleToSome
            ? await db.BookingShares.Where(s => s.BookingId == booking.Id).Select(s => s.UserId).ToListAsync()
            : [];
        // Quien la ha ocultado de sus listas no quiere avisos de ella.
        var hiddenBy = await db.BookingHides.Where(h => h.BookingId == booking.Id).Select(h => h.UserId).ToListAsync();
        return members
            .Where(m => booking.Visibility == Booking.VisibleToHousehold || m.Role == HouseholdMember.Admin || m.UserId == booking.CreatedBy || sharedWith.Contains(m.UserId))
            .Where(m => !hiddenBy.Contains(m.UserId))
            .Select(m => m.UserId)
            .Distinct()
            .ToList();
    }

    public Task<Booking?> VisibleBooking(string userId, Guid bookingId) =>
        VisibleBookings(userId).FirstOrDefaultAsync(b => b.Id == bookingId);

    /// <summary>
    /// Documentos de viaje del hogar: los ve todo el hogar, salvo los que quien los apuntó dejó solo para sí (estos ni
    /// siquiera los ve quien administra: son papeles personales).
    /// </summary>
    public IQueryable<TravelDocument> VisibleDocuments(string userId) =>
        from document in db.TravelDocuments
        join member in db.HouseholdMembers on document.HouseholdId equals member.HouseholdId
        where member.UserId == userId && member.DeletedAtMs == null
        where document.Visibility == Booking.VisibleToHousehold || document.CreatedBy == userId
        select document;

    /// <summary>Los adjuntos de las reservas que ve y los de sus documentos (el adjunto apunta al documento en BookingId).</summary>
    public IQueryable<Attachment> VisibleAttachments(string userId) =>
        (from attachment in db.Attachments
         join booking in VisibleBookings(userId) on attachment.BookingId equals booking.Id
         select attachment)
        .Concat(
            from attachment in db.Attachments
            join document in VisibleDocuments(userId) on attachment.BookingId equals document.Id
            select attachment);

    public Task<Attachment?> VisibleAttachment(string userId, Guid attachmentId) =>
        VisibleAttachments(userId).FirstOrDefaultAsync(a => a.Id == attachmentId);

    public IQueryable<InboxItem> VisibleInboxItems(string userId) =>
        from item in db.InboxItems
        join member in db.HouseholdMembers on item.HouseholdId equals member.HouseholdId
        where member.UserId == userId && member.DeletedAtMs == null
        select item;
}
