using System.Net;

namespace Viajes.Tests;

public sealed class TripApiTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task A_trip_is_created_and_comes_back_in_sync()
    {
        var api = await TripsApi.SignUp(app, "viaje1@example.com");
        var id = Guid.NewGuid();

        var response = await api.PutTrip(id, "Japón", "Tokio", "2026-10-12", "2026-10-20");
        var sync = await api.GetSync();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var trip = Assert.Single(sync.Trips);
        Assert.Equal((id, "Japón", "Tokio", "2026-10-12", "2026-10-20"), (trip.Id, trip.Title, trip.Destination, trip.StartDate, trip.EndDate));
        Assert.Equal([id], sync.TripIds);
        Assert.True(sync.Version >= trip.Version);
    }

    [Fact]
    public async Task Resending_the_same_trip_neither_duplicates_nor_bumps_the_version()
    {
        var api = await TripsApi.SignUp(app, "viaje2@example.com");
        var id = Guid.NewGuid();

        await api.PutTrip(id, "Mismo");
        var first = (await api.GetSync()).Trips.Single().Version;
        var again = await api.PutTrip(id, "Mismo");
        var sync = await api.GetSync();

        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
        Assert.Equal(first, Assert.Single(sync.Trips).Version);
    }

    [Fact]
    public async Task Editing_a_trip_bumps_its_version()
    {
        var api = await TripsApi.SignUp(app, "viaje3@example.com");
        var id = Guid.NewGuid();

        await api.PutTrip(id, "Antes");
        var before = (await api.GetSync()).Trips.Single().Version;
        await api.PutTrip(id, "Después");
        var after = (await api.GetSync()).Trips.Single();

        Assert.Equal("Después", after.Title);
        Assert.True(after.Version > before);
    }

    [Fact]
    public async Task A_trip_without_title_or_with_a_bad_date_is_rejected()
    {
        var api = await TripsApi.SignUp(app, "viaje4@example.com");

        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutTrip(Guid.NewGuid(), "  ")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutTrip(Guid.NewGuid(), "Ok", start: "12/10/2026")).StatusCode);
    }

    [Fact]
    public async Task Deleting_an_old_trip_cascades_and_shows_up_as_deleted_in_the_next_sync()
    {
        var api = await TripsApi.SignUp(app, "viaje5@example.com");
        var tripId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        await api.PutTrip(tripId, "Viejo");
        await api.PutBooking(bookingId, tripId);
        await api.PutAttachment(attachmentId, bookingId);
        await api.PutContent(attachmentId, [1, 2, 3]);
        for (var i = 0; i < 5; i++)
        {
            await api.PutTrip(Guid.NewGuid(), $"Relleno {i}");
        }

        var synced = (await api.GetSync()).Version;
        var response = await api.DeleteTrip(tripId);
        var sync = await api.GetSync(synced);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.NotNull(Assert.Single(sync.Trips, t => t.Id == tripId).DeletedAtMs);
        Assert.NotNull(Assert.Single(sync.Bookings, b => b.Id == bookingId).DeletedAtMs);
        Assert.NotNull(Assert.Single(sync.Attachments, a => a.Id == attachmentId).DeletedAtMs);
        Assert.DoesNotContain(tripId, sync.TripIds);
        Assert.Equal(HttpStatusCode.NotFound, (await api.GetContent(attachmentId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await api.PutTrip(tripId, "Resucitado")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await api.DeleteTrip(tripId)).StatusCode);
    }

    [Fact]
    public async Task Another_user_cannot_see_edit_or_delete_my_trip()
    {
        var ana = await TripsApi.SignUp(app, "ana-viaje@example.com");
        var bea = await TripsApi.SignUp(app, "bea-viaje@example.com");
        var tripId = Guid.NewGuid();
        await ana.PutTrip(tripId, "De Ana");

        Assert.Empty((await bea.GetSync()).Trips);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.PutTrip(tripId, "Robado")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.DeleteTrip(tripId)).StatusCode);
        Assert.Equal("De Ana", (await ana.GetSync()).Trips.Single().Title);
    }

    [Fact]
    public async Task Sync_since_returns_only_newer_rows_but_the_full_list_of_trip_ids()
    {
        var api = await TripsApi.SignUp(app, "viaje6@example.com");
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        await api.PutTrip(first, "Primero");
        var mid = (await api.GetSync()).Version;
        await api.PutTrip(second, "Segundo");

        var sync = await api.GetSync(mid);

        Assert.Equal([second], sync.Trips.Select(t => t.Id));
        Assert.Equal(2, sync.TripIds.Count);
        Assert.Contains(first, sync.TripIds);
        Assert.Empty((await api.GetSync(sync.Version)).Trips);
    }

    [Fact]
    public async Task Sync_needs_a_session()
    {
        var response = await app.CreateHttpsClient(handleCookies: false).GetAsync("/api/sync");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
