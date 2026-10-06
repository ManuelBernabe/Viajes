using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class BookingHideTests(TestApp app) : IClassFixture<TestApp>
{
    private static async Task<Guid[]> Hidden(TripsApi api) =>
        (await api.Client.GetFromJsonAsync<JsonElement>("/api/sync?since=0")).GetProperty("hiddenBookingIds").EnumerateArray().Select(e => e.GetGuid()).ToArray();

    [Fact]
    public async Task Someone_can_hide_a_booking_from_their_own_lists_and_calendar_only()
    {
        var admin = await TripsApi.SignUp(app, "ocultar-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var invitation = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = "ocultar-bea@example.com", password = Auth.Password, invitation })).EnsureSuccessStatusCode();
        var bea = new TripsApi(client);

        var tripId = Guid.NewGuid();
        (await admin.PutTrip(tripId, "Japón", "Tokio", "2026-10-10", "2026-10-15")).EnsureSuccessStatusCode();
        var beaHotel = Guid.NewGuid();
        (await bea.PutBooking(beaHotel, tripId, new { title = "Hotel de Bea", visibility = "private" })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.PutAsync($"/api/bookings/{beaHotel}/hidden", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.PutAsync($"/api/bookings/{beaHotel}/hidden", null)).StatusCode);
        Assert.Equal([beaHotel], await Hidden(admin));
        Assert.Empty(await Hidden(bea));

        // Fuera del calendario de quien la oculta.
        var key = await admin.Client.PostAsJsonAsync("/api/import-tokens/", new { scope = "calendar" });
        var token = (await key.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var ics = await app.CreateHttpsClient(handleCookies: false).GetStringAsync($"/api/calendar/{token}.ics");
        Assert.DoesNotContain("Hotel de Bea", ics);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.DeleteAsync($"/api/bookings/{beaHotel}/hidden")).StatusCode);
        Assert.Empty(await Hidden(admin));

        var luis = await TripsApi.SignUp(app, "ocultar-luis@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.PutAsync($"/api/bookings/{beaHotel}/hidden", null)).StatusCode);
    }
}
