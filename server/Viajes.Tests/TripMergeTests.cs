using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class TripMergeTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Merging_a_trip_moves_everything_widens_the_dates_and_deletes_it()
    {
        var ana = await TripsApi.SignUp(app, "unir1@example.com");
        var main = Guid.NewGuid();
        var dup = Guid.NewGuid();
        (await ana.PutTrip(main, "Argentina Brasil", "Buenos Aires", "2026-10-01", "2026-10-12")).EnsureSuccessStatusCode();
        (await ana.PutTrip(dup, "Brasil", "Río de Janeiro", "2026-10-14", "2026-10-19")).EnsureSuccessStatusCode();
        var flight = Guid.NewGuid();
        (await ana.PutBooking(flight, dup, new { title = "G3 7671 AEP → GIG", startLocal = "2026-10-14T10:00", endLocal = "2026-10-14T13:00", endTz = "America/Sao_Paulo" })).EnsureSuccessStatusCode();
        (await ana.Client.PutAsJsonAsync($"/api/places/{Guid.NewGuid()}", new { tripId = dup, name = "Pão de Açúcar", category = "see", visited = false })).EnsureSuccessStatusCode();
        (await ana.Client.PostAsJsonAsync($"/api/trips/{main}/packing", new { items = new[] { new { text = "Pasaporte" } } })).EnsureSuccessStatusCode();
        (await ana.Client.PostAsJsonAsync($"/api/trips/{dup}/packing", new { items = new[] { new { text = "pasaporte" }, new { text = "Bañador" } } })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.BadRequest, (await ana.Client.PostAsJsonAsync($"/api/trips/{dup}/merge", new { into = dup })).StatusCode);
        var merged = await ana.Client.PostAsJsonAsync($"/api/trips/{dup}/merge", new { into = main });
        Assert.Equal(HttpStatusCode.OK, merged.StatusCode);

        var sync = await ana.Client.GetFromJsonAsync<JsonElement>("/api/sync?since=0");
        var trips = sync.GetProperty("trips").EnumerateArray().ToArray();
        var target = trips.Single(t => t.GetProperty("id").GetGuid() == main);
        Assert.Equal("2026-10-01", target.GetProperty("startDate").GetString());
        Assert.Equal("2026-10-19", target.GetProperty("endDate").GetString());
        Assert.DoesNotContain(trips, t => t.GetProperty("id").GetGuid() == dup && t.GetProperty("deletedAtMs").ValueKind == JsonValueKind.Null);
        var booking = sync.GetProperty("bookings").EnumerateArray().Single(b => b.GetProperty("id").GetGuid() == flight);
        Assert.Equal(main, booking.GetProperty("tripId").GetGuid());
        Assert.Contains(sync.GetProperty("places").EnumerateArray(), p => p.GetProperty("tripId").GetGuid() == main && p.GetProperty("name").GetString() == "Pão de Açúcar");

        var packing = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{main}/packing");
        Assert.Equal(["Pasaporte", "Bañador"], packing.EnumerateArray().Select(i => i.GetProperty("text").GetString()));

        // Otro hogar no puede.
        var luis = await TripsApi.SignUp(app, "unir2@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.PostAsJsonAsync($"/api/trips/{main}/merge", new { into = dup })).StatusCode);
    }
}
