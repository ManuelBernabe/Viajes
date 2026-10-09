using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class JournalTests(TestApp app) : IClassFixture<TestApp>
{
    private static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    [Fact]
    public async Task The_journal_keeps_notes_and_photos_per_day_with_a_trip_summary()
    {
        var ana = await TripsApi.SignUp(app, "diario1@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Argentina", "Buenos Aires", "2026-10-01", "2026-10-10")).EnsureSuccessStatusCode();
        (await ana.PutBooking(Guid.NewGuid(), tripId, new { title = "UX 41 MAD → EZE", startLocal = "2026-10-01T23:00", endLocal = "2026-10-02T08:00", endTz = "America/Argentina/Buenos_Aires", endPlace = "EZE" })).EnsureSuccessStatusCode();
        // El mismo vuelo, otro pasajero: cuenta una vez.
        (await ana.PutBooking(Guid.NewGuid(), tripId, new { title = "UX 41 MAD → EZE · Manuel", startLocal = "2026-10-01T23:00", endLocal = "2026-10-02T08:00", endTz = "America/Argentina/Buenos_Aires", endPlace = "EZE" })).EnsureSuccessStatusCode();
        (await ana.PutBooking(Guid.NewGuid(), tripId, new { type = "hotel", title = "Hotel", startLocal = "2026-10-02T15:00", startTz = "America/Argentina/Buenos_Aires", startPlace = "Hotel", endLocal = "2026-10-05T11:00", endTz = "America/Argentina/Buenos_Aires", endPlace = (string?)null })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.BadRequest, (await ana.Client.PutAsJsonAsync($"/api/trips/{tripId}/journal/ayer", new { text = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.PutAsJsonAsync($"/api/trips/{tripId}/journal/2026-10-02", new { text = "Llegamos a Buenos Aires." })).StatusCode);

        var content = new ByteArrayContent(Png);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var upload = await ana.Client.PostAsync($"/api/trips/{tripId}/journal/2026-10-03/photos", content);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var photoId = (await upload.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var journal = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/journal");
        var days = journal.GetProperty("days").EnumerateArray().ToArray();
        Assert.Equal(["2026-10-02", "2026-10-03"], days.Select(d => d.GetProperty("date").GetString()));
        Assert.Equal("Llegamos a Buenos Aires.", days[0].GetProperty("text").GetString());
        Assert.Equal(photoId, days[1].GetProperty("photos")[0].GetProperty("id").GetGuid());
        var stats = journal.GetProperty("stats");
        Assert.Equal(1, stats.GetProperty("flights").GetInt32());
        Assert.InRange(stats.GetProperty("km").GetInt32(), 9900, 10200);
        Assert.Equal(3, stats.GetProperty("nights").GetInt32());

        var photo = await ana.Client.GetAsync($"/api/trips/{tripId}/journal/photos/{photoId}");
        Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
        Assert.Equal(Png, await photo.Content.ReadAsByteArrayAsync());

        // Sin miniatura, la cuadrícula recibe la foto; con ella, la miniatura.
        Assert.Equal(Png, await ana.Client.GetByteArrayAsync($"/api/trips/{tripId}/journal/photos/{photoId}?size=thumb"));
        var mini = new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 };
        var thumb = new ByteArrayContent(mini);
        thumb.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.PutAsync($"/api/trips/{tripId}/journal/photos/{photoId}/thumb", thumb)).StatusCode);
        Assert.Equal(mini, await ana.Client.GetByteArrayAsync($"/api/trips/{tripId}/journal/photos/{photoId}?size=thumb"));
        Assert.Equal(Png, await ana.Client.GetByteArrayAsync($"/api/trips/{tripId}/journal/photos/{photoId}"));

        // En el enlace compartido sale el diario con su foto.
        var token = (await (await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/share", new { lang = "es" })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var anonymous = app.CreateHttpsClient(handleCookies: false);
        var html = await anonymous.GetStringAsync($"/i/{token}");
        Assert.Contains("Diario del viaje", html);
        Assert.Contains("Llegamos a Buenos Aires.", html);
        Assert.Contains($"/i/{token}/p/{photoId}", html);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/i/{token}/p/{photoId}")).StatusCode);
        Assert.Equal(mini, await anonymous.GetByteArrayAsync($"/i/{token}/m/{photoId}"));

        // Otro hogar no.
        var luis = await TripsApi.SignUp(app, "diario2@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.GetAsync($"/api/trips/{tripId}/journal")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.GetAsync($"/api/trips/{tripId}/journal/photos/{photoId}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.DeleteAsync($"/api/trips/{tripId}/journal/photos/{photoId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/i/{token}/p/{photoId}")).StatusCode);
    }
}
