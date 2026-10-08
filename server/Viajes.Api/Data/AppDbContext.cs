using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Viajes.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<DiagMark> DiagMarks => Set<DiagMark>();

    public DbSet<Household> Households => Set<Household>();

    public DbSet<HouseholdMember> HouseholdMembers => Set<HouseholdMember>();

    public DbSet<Trip> Trips => Set<Trip>();

    public DbSet<Booking> Bookings => Set<Booking>();

    public DbSet<Place> Places => Set<Place>();

    public DbSet<PlaceIdea> PlaceIdeas => Set<PlaceIdea>();

    public DbSet<PackingItem> PackingItems => Set<PackingItem>();

    public DbSet<TravelDocument> TravelDocuments => Set<TravelDocument>();

    public DbSet<Attachment> Attachments => Set<Attachment>();

    public DbSet<ChangeCounter> ChangeCounter => Set<ChangeCounter>();

    public DbSet<ImportToken> ImportTokens => Set<ImportToken>();

    public DbSet<InboxItem> InboxItems => Set<InboxItem>();

    public DbSet<InboxAttachment> InboxAttachments => Set<InboxAttachment>();

    public DbSet<Invitation> Invitations => Set<Invitation>();

    public DbSet<BookingShare> BookingShares => Set<BookingShare>();

    public DbSet<BookingHide> BookingHides => Set<BookingHide>();

    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();

    public DbSet<ReminderLog> ReminderLogs => Set<ReminderLog>();

    public DbSet<FlightStatusRow> FlightStatuses => Set<FlightStatusRow>();

    public DbSet<AppSetting> AppSettings => Set<AppSetting>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<DiagMark>(mark =>
        {
            mark.HasKey(m => m.Id);
            mark.Property(m => m.Local).HasMaxLength(100);
            mark.HasIndex(m => m.UserId);
        });

        builder.Entity<ChangeCounter>(counter =>
        {
            counter.ToTable("ChangeCounter");
            counter.HasKey(c => c.Id);
            counter.Property(c => c.Id).ValueGeneratedNever();
            counter.HasData(new ChangeCounter { Id = 1, Value = 0 });
        });

        builder.Entity<Household>(household =>
        {
            household.HasKey(h => h.Id);
            household.Property(h => h.Name).HasMaxLength(100);
            household.HasIndex(h => h.Version);
        });

        builder.Entity<HouseholdMember>(member =>
        {
            member.HasKey(m => new { m.HouseholdId, m.UserId });
            member.Property(m => m.Role).HasMaxLength(20);
            member.HasIndex(m => m.UserId);
            member.HasIndex(m => m.Version);
        });

        builder.Entity<Trip>(trip =>
        {
            trip.HasKey(t => t.Id);
            trip.Property(t => t.Title).HasMaxLength(200);
            trip.Property(t => t.Destination).HasMaxLength(200);
            trip.Property(t => t.StartDate).HasMaxLength(10);
            trip.Property(t => t.EndDate).HasMaxLength(10);
            trip.HasIndex(t => t.HouseholdId);
            trip.HasIndex(t => t.Version);
        });

        builder.Entity<Place>(place =>
        {
            place.HasKey(p => p.Id);
            place.Property(p => p.Name).HasMaxLength(200);
            place.Property(p => p.Category).HasMaxLength(20);
            place.Property(p => p.Notes).HasMaxLength(2000);
            place.Property(p => p.Url).HasMaxLength(1000);
            place.Property(p => p.Address).HasMaxLength(300);
            place.HasIndex(p => p.TripId);
            place.HasIndex(p => p.Version);
        });

        builder.Entity<TravelDocument>(document =>
        {
            document.HasKey(d => d.Id);
            document.Property(d => d.Person).HasMaxLength(100);
            document.Property(d => d.Kind).HasMaxLength(20);
            document.Property(d => d.Number).HasMaxLength(100);
            document.Property(d => d.Country).HasMaxLength(100);
            document.Property(d => d.IssuedDate).HasMaxLength(10);
            document.Property(d => d.ExpiryDate).HasMaxLength(10);
            document.Property(d => d.Notes).HasMaxLength(2000);
            document.Property(d => d.Visibility).HasMaxLength(20);
            document.HasIndex(d => d.HouseholdId);
            document.HasIndex(d => d.Version);
        });

        builder.Entity<PackingItem>(item =>
        {
            item.HasKey(i => i.Id);
            item.Property(i => i.Text).HasMaxLength(200);
            item.Property(i => i.Category).HasMaxLength(40);
            item.Property(i => i.ForWhom).HasMaxLength(100);
            item.Property(i => i.CheckedBy).HasMaxLength(256);
            item.HasIndex(i => i.TripId);
        });

        builder.Entity<PlaceIdea>(idea =>
        {
            idea.HasKey(i => i.Id);
            idea.Property(i => i.Name).HasMaxLength(200);
            idea.Property(i => i.Category).HasMaxLength(20);
            idea.Property(i => i.Description).HasMaxLength(500);
            idea.Property(i => i.Address).HasMaxLength(300);
            idea.Property(i => i.Area).HasMaxLength(100);
            idea.HasIndex(i => i.TripId);
        });

        builder.Entity<Booking>(booking =>
        {
            booking.HasKey(b => b.Id);
            booking.Property(b => b.Type).HasMaxLength(20);
            booking.Property(b => b.Visibility).HasMaxLength(20).HasDefaultValue(Booking.VisibleToHousehold);
            booking.Property(b => b.Title).HasMaxLength(200);
            booking.Property(b => b.StartLocal).HasMaxLength(19);
            booking.Property(b => b.StartTz).HasMaxLength(64);
            booking.Property(b => b.EndLocal).HasMaxLength(19);
            booking.Property(b => b.EndTz).HasMaxLength(64);
            booking.Property(b => b.StartPlace).HasMaxLength(200);
            booking.Property(b => b.EndPlace).HasMaxLength(200);
            booking.Property(b => b.Reference).HasMaxLength(100);
            booking.Property(b => b.Address).HasMaxLength(500);
            booking.Property(b => b.Notes).HasMaxLength(4000);
            booking.Property(b => b.ChangeNote).HasMaxLength(1000);
            booking.HasIndex(b => b.TripId);
            booking.HasIndex(b => b.Version);
        });

        builder.Entity<BookingShare>(share =>
        {
            share.HasKey(s => new { s.BookingId, s.UserId });
            share.HasIndex(s => s.UserId);
        });

        builder.Entity<BookingHide>(hide =>
        {
            hide.HasKey(h => new { h.BookingId, h.UserId });
            hide.HasIndex(h => h.UserId);
        });

        builder.Entity<Invitation>(invitation =>
        {
            invitation.HasKey(i => i.Id);
            invitation.Property(i => i.TokenHash).HasMaxLength(64);
            invitation.HasIndex(i => i.TokenHash).IsUnique();
            invitation.HasIndex(i => i.HouseholdId);
        });

        builder.Entity<PushSubscription>(subscription =>
        {
            subscription.HasKey(s => s.Id);
            subscription.Property(s => s.Endpoint).HasMaxLength(2000);
            subscription.Property(s => s.P256dh).HasMaxLength(200);
            subscription.Property(s => s.Auth).HasMaxLength(100);
            subscription.Property(s => s.LastError).HasMaxLength(500);
            subscription.HasIndex(s => s.Endpoint).IsUnique();
            subscription.HasIndex(s => s.UserId);
        });

        builder.Entity<AppSetting>(setting =>
        {
            setting.HasKey(a => a.Key);
            setting.Property(a => a.Key).HasMaxLength(50);
        });

        builder.Entity<FlightStatusRow>(flight =>
        {
            flight.ToTable("FlightStatuses");
            flight.HasKey(f => f.Key);
            flight.Property(f => f.Key).HasMaxLength(40);
        });

        builder.Entity<ReminderLog>(log =>
        {
            log.HasKey(l => new { l.BookingId, l.Kind, l.StartUtcMs });
            log.Property(l => l.Kind).HasMaxLength(20);
        });

        builder.Entity<ImportToken>(token =>
        {
            token.HasKey(t => t.Id);
            token.Property(t => t.TokenHash).HasMaxLength(64);
            token.Property(t => t.Label).HasMaxLength(100);
            token.Property(t => t.Scope).HasMaxLength(20).HasDefaultValue(ImportToken.ImportScope);
            token.HasIndex(t => t.TokenHash).IsUnique();
            token.HasIndex(t => t.UserId);
        });

        builder.Entity<InboxItem>(item =>
        {
            item.HasKey(i => i.Id);
            item.Property(i => i.MessageId).HasMaxLength(998);
            item.Property(i => i.FromAddress).HasMaxLength(320);
            item.Property(i => i.Subject).HasMaxLength(998);
            item.Property(i => i.Status).HasMaxLength(20);
            item.Property(i => i.RawFileKey).HasMaxLength(300);
            item.HasIndex(i => new { i.HouseholdId, i.MessageId }).IsUnique();
            item.HasIndex(i => i.Version);
        });

        builder.Entity<InboxAttachment>(attachment =>
        {
            attachment.HasKey(a => a.Id);
            attachment.Property(a => a.FileKey).HasMaxLength(300);
            attachment.Property(a => a.Name).HasMaxLength(255);
            attachment.Property(a => a.Mime).HasMaxLength(100);
            attachment.HasIndex(a => a.InboxItemId);
        });

        builder.Entity<Attachment>(attachment =>
        {
            attachment.HasKey(a => a.Id);
            attachment.Property(a => a.FileKey).HasMaxLength(300);
            attachment.Property(a => a.Name).HasMaxLength(255);
            attachment.Property(a => a.Mime).HasMaxLength(100);
            attachment.Property(a => a.QrText).HasMaxLength(4000);
            attachment.HasIndex(a => a.BookingId);
            attachment.HasIndex(a => a.Version);
        });
    }
}
