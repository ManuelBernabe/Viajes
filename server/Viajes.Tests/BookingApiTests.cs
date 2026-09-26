using System.Net;

namespace Viajes.Tests;

public sealed class BookingApiTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task A_booking_is_stored_with_its_utc_instant_derived_from_the_place()
    {
        var api = await TripsApi.SignUp(app, "reserva1@example.com");
        var tripId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        await api.PutTrip(tripId);

        var response = await api.PutBooking(bookingId, tripId);
        var booking = (await api.GetSync()).Bookings.Single();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(("flight", "Vuelo a Tokio", "2026-10-12T10:05", "Europe/Madrid", "ABC123"), (booking.Type, booking.Title, booking.StartLocal, booking.StartTz, booking.Reference));
        Assert.Equal(new DateTimeOffset(2026, 10, 12, 8, 5, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), booking.StartUtcMs);
        Assert.Equal("Asia/Tokyo", booking.EndTz);
    }

    [Fact]
    public async Task Resending_a_booking_does_not_duplicate_it()
    {
        var api = await TripsApi.SignUp(app, "reserva2@example.com");
        var tripId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        await api.PutTrip(tripId);

        await api.PutBooking(bookingId, tripId);
        await api.PutBooking(bookingId, tripId);

        Assert.Single((await api.GetSync()).Bookings);
    }

    [Fact]
    public async Task Bad_type_time_or_zone_are_rejected()
    {
        var api = await TripsApi.SignUp(app, "reserva3@example.com");
        var tripId = Guid.NewGuid();
        await api.PutTrip(tripId);

        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutBooking(Guid.NewGuid(), tripId, new { type = "rocket" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutBooking(Guid.NewGuid(), tripId, new { startTz = "Marte/Olympus" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutBooking(Guid.NewGuid(), tripId, new { startLocal = "mañana" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutBooking(Guid.NewGuid(), tripId, new { title = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutBooking(Guid.NewGuid(), tripId, new { endLocal = "2026-10-13T08:55", endTz = (string?)null })).StatusCode);
    }

    [Fact]
    public async Task Arrival_is_optional()
    {
        var api = await TripsApi.SignUp(app, "reserva4@example.com");
        var tripId = Guid.NewGuid();
        await api.PutTrip(tripId);

        var response = await api.PutBooking(Guid.NewGuid(), tripId, new { type = "hotel", endLocal = (string?)null, endTz = (string?)null, endPlace = (string?)null });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null((await api.GetSync()).Bookings.Single().EndLocal);
    }

    [Fact]
    public async Task A_booking_on_someone_elses_or_a_deleted_trip_is_refused()
    {
        var ana = await TripsApi.SignUp(app, "ana-reserva@example.com");
        var bea = await TripsApi.SignUp(app, "bea-reserva@example.com");
        var tripId = Guid.NewGuid();
        await ana.PutTrip(tripId);

        Assert.Equal(HttpStatusCode.NotFound, (await bea.PutBooking(Guid.NewGuid(), tripId)).StatusCode);

        await ana.DeleteTrip(tripId);
        Assert.Equal(HttpStatusCode.Conflict, (await ana.PutBooking(Guid.NewGuid(), tripId)).StatusCode);
    }

    [Fact]
    public async Task Editing_a_deleted_booking_is_a_conflict_and_deleting_twice_is_fine()
    {
        var api = await TripsApi.SignUp(app, "reserva5@example.com");
        var tripId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        await api.PutTrip(tripId);
        await api.PutBooking(bookingId, tripId);

        Assert.Equal(HttpStatusCode.NoContent, (await api.DeleteBooking(bookingId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await api.PutBooking(bookingId, tripId, new { title = "Editada" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await api.DeleteBooking(bookingId)).StatusCode);
        Assert.NotNull((await api.GetSync()).Bookings.Single().DeletedAtMs);
    }

    [Fact]
    public async Task A_booking_cannot_be_moved_to_another_trip_by_id_collision()
    {
        var ana = await TripsApi.SignUp(app, "ana-colision@example.com");
        var bea = await TripsApi.SignUp(app, "bea-colision@example.com");
        var anaTrip = Guid.NewGuid();
        var beaTrip = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        await ana.PutTrip(anaTrip);
        await bea.PutTrip(beaTrip);
        await ana.PutBooking(bookingId, anaTrip);

        var response = await bea.PutBooking(bookingId, beaTrip, new { title = "Robada" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Vuelo a Tokio", (await ana.GetSync()).Bookings.Single().Title);
        Assert.Empty((await bea.GetSync()).Bookings);
    }
}
