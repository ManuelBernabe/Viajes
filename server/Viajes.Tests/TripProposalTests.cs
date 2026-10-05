using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Viajes.Api.Inbox;

namespace Viajes.Tests;

public sealed class TripProposalTests(PlaceAiApp app) : IClassFixture<PlaceAiApp>
{
    private async Task<Guid> SharedText(TripsApi api, string text)
    {
        var key = await api.Client.PostAsJsonAsync("/api/import-tokens/", new { scope = "share" });
        var token = (await key.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/inbox/share") { Content = new ByteArrayContent(Encoding.UTF8.GetBytes(text)) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse("text/plain; charset=utf-8");
        (await app.CreateHttpsClient().SendAsync(request)).EnsureSuccessStatusCode();
        return Assert.Single((await api.GetSyncFull()).Inbox).Id;
    }

    [Fact]
    public async Task A_booking_without_trip_gets_a_proposed_name_and_destination()
    {
        var ana = await TripsApi.SignUp(app, "propuesta1@example.com");
        var itemId = await SharedText(ana, "Confirmación de tu vuelo VY 8460 Barcelona - Lisboa, 12 de diciembre");

        var previous = app.Fake.Answer;
        app.Fake.Answer = """{"title": "Lisboa", "destination": "Lisboa"}""";
        try
        {
            var response = await ana.Client.PostAsJsonAsync($"/api/inbox/{itemId}/trip-proposal", new { lang = "es" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("Lisboa", body.GetProperty("title").GetString());
            Assert.Equal("Lisboa", body.GetProperty("destination").GetString());
            Assert.Contains("VY 8460", app.Fake.Prompts.Last());
            Assert.Equal(JsonValueKind.Null, body.GetProperty("tripId").ValueKind);

            // Con un viaje del hogar que encaja, la IA lo elige; un id que no es del hogar se ignora.
            var tripId = Guid.NewGuid();
            (await ana.PutTrip(tripId, "Portugal", "Lisboa", "2026-12-10", "2026-12-15")).EnsureSuccessStatusCode();
            app.Fake.Answer = $$"""{"tripId": "{{tripId}}", "title": "Portugal", "destination": "Lisboa"}""";
            var chosen = await (await ana.Client.PostAsJsonAsync($"/api/inbox/{itemId}/trip-proposal", new { lang = "es" })).Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(tripId, chosen.GetProperty("tripId").GetGuid());
            Assert.Contains($"{tripId} | Portugal | destino: Lisboa | fechas: 2026-12-10 a 2026-12-15", app.Fake.Prompts.Last());

            app.Fake.Answer = $$"""{"tripId": "{{Guid.NewGuid()}}", "title": "Lisboa", "destination": "Lisboa"}""";
            var foreign = await (await ana.Client.PostAsJsonAsync($"/api/inbox/{itemId}/trip-proposal", new { lang = "es" })).Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(JsonValueKind.Null, foreign.GetProperty("tripId").ValueKind);

            var luis = await TripsApi.SignUp(app, "propuesta1-luis@example.com");
            Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.PostAsJsonAsync($"/api/inbox/{itemId}/trip-proposal", new { lang = "es" })).StatusCode);

            app.Fake.Answer = "nada";
            Assert.Equal(HttpStatusCode.BadGateway, (await ana.Client.PostAsJsonAsync($"/api/inbox/{itemId}/trip-proposal", new { lang = "es" })).StatusCode);
        }
        finally
        {
            app.Fake.Answer = previous;
        }
    }

    [Fact]
    public void Parse_needs_a_title()
    {
        Assert.Null(TripProposals.Parse("""{"title": "", "destination": "Roma"}"""));
        Assert.Equal(new TripProposals.Proposal("Roma", null), TripProposals.Parse("""{"title": " Roma ", "destination": null}"""));
    }
}
