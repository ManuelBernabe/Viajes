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

    public IQueryable<Booking> VisibleBookings(string userId) =>
        from booking in db.Bookings
        join trip in VisibleTrips(userId) on booking.TripId equals trip.Id
        select booking;

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
