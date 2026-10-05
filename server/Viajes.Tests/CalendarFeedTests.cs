using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Viajes.Api.Calendar;

namespace Viajes.Tests;

public sealed class CalendarFeedTests(TestApp app) : IClassFixture<TestApp>
{
    private async Task<(TripsApi Admin, TripsApi Bea)> Household(string prefix)
    {
        var admin = await TripsApi.SignUp(app, $"{prefix}-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var invitation = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = $"{prefix}-bea@example.com", password = Auth.Password, invitation })).EnsureSuccessStatusCode();
        return (admin, new TripsApi(client));
    }

    [Fact]
    public async Task Anyone_gets_a_personal_feed_with_trips_and_the_bookings_they_can_see()
    {
        var (admin, bea) = await Household("calendario1");
        var tripId = Guid.NewGuid();
        (await admin.PutTrip(tripId, "Japón", "Tokio", "2026-10-10", "2026-10-15")).EnsureSuccessStatusCode();
        (await admin.PutBooking(Guid.NewGuid(), tripId)).EnsureSuccessStatusCode();
        (await admin.PutBooking(Guid.NewGuid(), tripId, new { title = "Hotel secreto", type = "hotel", visibility = "private" })).EnsureSuccessStatusCode();
        (await bea.PutBooking(Guid.NewGuid(), tripId, new
        {
            title = "Hotel Shinjuku", type = "hotel", startLocal = "2026-10-12T15:00", startTz = "Asia/Tokyo", startPlace = "Hotel Shinjuku",
            endLocal = "2026-10-15T11:00", endTz = "Asia/Tokyo", endPlace = (string?)null, address = "Shinjuku, Tokio", reference = "H1; B2",
        })).EnsureSuccessStatusCode();

        // La clave del calendario es personal: la crea cualquiera del hogar, no solo quien administra.
        var created = await bea.Client.PostAsJsonAsync("/api/import-tokens/", new { scope = "calendar" });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var key = await created.Content.ReadFromJsonAsync<JsonElement>();
        var token = key.GetProperty("token").GetString()!;

        var anonymous = app.CreateHttpsClient(handleCookies: false);
        var response = await anonymous.GetAsync($"/api/calendar/{token}.ics");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/calendar", response.Content.Headers.ContentType?.MediaType);
        var ics = await response.Content.ReadAsStringAsync();

        Assert.StartsWith("BEGIN:VCALENDAR\r\n", ics);
        Assert.Contains("DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261016\r\n", ics);
        Assert.Contains("SUMMARY:🧳 Japón", ics);
        // El vuelo con su hora real: 10:05 en Madrid y llegada 08:55 en Tokio, en UTC.
        Assert.Contains("DTSTART:20261012T080500Z\r\nDTEND:20261012T235500Z", ics);
        Assert.Contains("LOCATION:MAD → HND", ics);
        // El hotel de varias noches, día a día; con los caracteres especiales escapados.
        Assert.Contains("DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261015", ics);
        Assert.Contains(@"Localizador: H1\; B2", ics);
        Assert.DoesNotContain("Hotel secreto", ics);

        // Revocada, el enlace deja de funcionar; uno inventado, tampoco.
        Assert.Equal(HttpStatusCode.NoContent, (await bea.Client.DeleteAsync($"/api/import-tokens/{key.GetProperty("id").GetString()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/calendar/{token}.ics")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/calendar/{new string('a', 64)}.ics")).StatusCode);
    }

    [Fact]
    public void Long_lines_are_folded_at_75_bytes_without_breaking_characters()
    {
        var trip = new CalendarFeed.FeedTrip(Guid.NewGuid(), string.Concat(Enumerable.Repeat("Viaje a Japón ✈️ ", 12)), null, "2026-10-10", null);
        var ics = CalendarFeed.Build([trip], [], "https://viajes.example", DateTimeOffset.UnixEpoch);
        foreach (var line in ics.Split("\r\n"))
        {
            Assert.True(Encoding.UTF8.GetByteCount(line) <= 75, line);
        }

        // Al desplegar (quitar «CRLF + espacio») vuelve el texto entero.
        Assert.Contains(string.Concat(Enumerable.Repeat("Viaje a Japón ✈️ ", 12)).TrimEnd(), ics.Replace("\r\n ", ""));
        Assert.Contains("DTEND;VALUE=DATE:20261011", ics);
    }
}
