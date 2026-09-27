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

    public Task<Trip?> VisibleTrip(string userId, Guid tripId) =>
        VisibleTrips(userId).FirstOrDefaultAsync(t => t.Id == tripId);

    /// <summary>
    /// Regla de las reservas (decidida por Manuel el 27/09/2026): quien administra el hogar ve todas; las que crea quien
    /// administra las ve todo el hogar; las que crea un invitado solo las ven ese invitado y quien administra.
    /// </summary>
    public IQueryable<Booking> VisibleBookings(string userId) =>
        from booking in db.Bookings
        join trip in db.Trips on booking.TripId equals trip.Id
        join member in db.HouseholdMembers on trip.HouseholdId equals member.HouseholdId
        where member.UserId == userId && member.DeletedAtMs == null
        where member.Role == HouseholdMember.Admin
            || booking.CreatedBy == userId
            || booking.Shared
            || db.HouseholdMembers.Any(a => a.HouseholdId == trip.HouseholdId && a.UserId == booking.CreatedBy && a.Role == HouseholdMember.Admin && a.DeletedAtMs == null)
        select booking;

    /// <summary>Quiénes pueden ver una reserva (para los avisos): el hogar entero si la creó quien administra; si no, su creador y quien administra.</summary>
    public async Task<List<string>> BookingAudience(Booking booking)
    {
        var trip = await db.Trips.FirstOrDefaultAsync(t => t.Id == booking.TripId);
        if (trip is null)
        {
            return [];
        }

        var members = await db.HouseholdMembers.Where(m => m.HouseholdId == trip.HouseholdId && m.DeletedAtMs == null).ToListAsync();
        var everyone = booking.Shared || members.Any(m => m.UserId == booking.CreatedBy && m.Role == HouseholdMember.Admin);
        return members
            .Where(m => everyone || m.Role == HouseholdMember.Admin || m.UserId == booking.CreatedBy)
            .Select(m => m.UserId)
            .Distinct()
            .ToList();
    }

    public Task<Booking?> VisibleBooking(string userId, Guid bookingId) =>
        VisibleBookings(userId).FirstOrDefaultAsync(b => b.Id == bookingId);

    public IQueryable<Attachment> VisibleAttachments(string userId) =>
        from attachment in db.Attachments
        join booking in VisibleBookings(userId) on attachment.BookingId equals booking.Id
        select attachment;

    public Task<Attachment?> VisibleAttachment(string userId, Guid attachmentId) =>
        VisibleAttachments(userId).FirstOrDefaultAsync(a => a.Id == attachmentId);

    public IQueryable<InboxItem> VisibleInboxItems(string userId) =>
        from item in db.InboxItems
        join member in db.HouseholdMembers on item.HouseholdId equals member.HouseholdId
        where member.UserId == userId && member.DeletedAtMs == null
        select item;
}
