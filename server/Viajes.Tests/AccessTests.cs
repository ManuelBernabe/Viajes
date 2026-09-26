using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Tests;

public sealed class AccessTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task A_new_account_gets_a_household_where_it_is_admin()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "hogar@example.com");

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.SingleAsync(u => u.Email == "hogar@example.com");
        var member = await db.HouseholdMembers.SingleAsync(m => m.UserId == user.Id);
        var household = await db.Households.SingleAsync(h => h.Id == member.HouseholdId);

        Assert.Equal(HouseholdMember.Admin, member.Role);
        Assert.Equal(user.Id, household.AdminUserId);
        Assert.Equal(AccessService.DefaultHouseholdName, household.Name);
    }

    [Fact]
    public async Task Ensuring_a_household_twice_keeps_the_same_one()
    {
        using var scope = app.Services.CreateScope();
        var access = scope.ServiceProvider.GetRequiredService<AccessService>();

        var first = await access.EnsureHousehold("repetido");
        var second = await access.EnsureHousehold("repetido");

        Assert.Equal(first, second);
    }

    [Fact]
    public async Task A_user_only_sees_trips_of_their_household()
    {
        using var scope = app.Services.CreateScope();
        var access = scope.ServiceProvider.GetRequiredService<AccessService>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var homeA = await access.EnsureHousehold("ana");
        var homeB = await access.EnsureHousehold("bea");
        var tripA = new Trip { Id = Guid.NewGuid(), HouseholdId = homeA, Title = "De Ana", CreatedBy = "ana" };
        var tripB = new Trip { Id = Guid.NewGuid(), HouseholdId = homeB, Title = "De Bea", CreatedBy = "bea" };
        db.Trips.AddRange(tripA, tripB);
        var booking = new Booking
        {
            Id = Guid.NewGuid(), TripId = tripA.Id, Type = "flight", Title = "Vuelo", StartLocal = "2026-10-12T10:05",
            StartTz = "Europe/Madrid", StartUtcMs = 0, CreatedBy = "ana",
        };
        db.Bookings.Add(booking);
        var attachment = new Attachment
        {
            Id = Guid.NewGuid(), BookingId = booking.Id, FileKey = "k", Name = "tarjeta.pdf", Mime = "application/pdf",
            Size = 1, CreatedBy = "ana",
        };
        db.Attachments.Add(attachment);
        await db.SaveChangesAsync();

        Assert.Equal([tripA.Id], await access.VisibleTrips("ana").Select(t => t.Id).ToListAsync());
        Assert.Equal([tripB.Id], await access.VisibleTrips("bea").Select(t => t.Id).ToListAsync());
        Assert.NotNull(await access.VisibleBooking("ana", booking.Id));
        Assert.Null(await access.VisibleBooking("bea", booking.Id));
        Assert.NotNull(await access.VisibleAttachment("ana", attachment.Id));
        Assert.Null(await access.VisibleAttachment("bea", attachment.Id));
        Assert.Null(await access.VisibleTrip("nadie", tripA.Id));
    }
}
