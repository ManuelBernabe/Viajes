using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class ItineraryShareTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task A_shared_itinerary_shows_household_bookings_without_references_and_can_be_revoked()
    {
        var ana = await TripsApi.SignUp(app, "itinerario1@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Japón <otoño>", "Tokio", "2026-10-12", "2026-10-20")).EnsureSuccessStatusCode();
        (await ana.PutBooking(Guid.NewGuid(), tripId, new { notes = "Nota privada" })).EnsureSuccessStatusCode();
        (await ana.PutBooking(Guid.NewGuid(), tripId, new { title = "Regalo sorpresa", type = "ticket", visibility = "private" })).EnsureSuccessStatusCode();

        var none = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/share");
        Assert.Equal(JsonValueKind.Null, none.GetProperty("token").ValueKind);

        var created = await (await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/share", new { lang = "en" })).Content.ReadFromJsonAsync<JsonElement>();
        var token = created.GetProperty("token").GetString()!;
        Assert.EndsWith($"/i/{token}", created.GetProperty("url").GetString());

        // El mismo enlace si se vuelve a pedir.
        var again = await (await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/share", new { lang = "es" })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(token, again.GetProperty("token").GetString());

        // Sin sesión.
        var anonymous = app.CreateHttpsClient(handleCookies: false);
        var page = await anonymous.GetAsync($"/i/{token}");
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Contains("nonce-", page.Headers.GetValues("Content-Security-Policy").Single());
        var html = await page.Content.ReadAsStringAsync();
        Assert.Contains("Japón &lt;otoño&gt;", html);
        Assert.Contains("Vuelo a Tokio", html);
        Assert.Contains("MAD → HND", html);
        Assert.Contains("Lunes, 12 de octubre de 2026", html);
        Assert.DoesNotContain("ABC123", html);
        Assert.DoesNotContain("Nota privada", html);
        Assert.DoesNotContain("Regalo sorpresa", html);

        // Otro hogar no lo gestiona.
        var luis = await TripsApi.SignUp(app, "itinerario2@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.DeleteAsync($"/api/trips/{tripId}/share")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.DeleteAsync($"/api/trips/{tripId}/share")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/i/{token}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/i/no-existe-este-enlace")).StatusCode);
    }
}
