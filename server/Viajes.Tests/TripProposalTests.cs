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
