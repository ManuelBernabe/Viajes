using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class PlaceTests(TestApp app) : IClassFixture<TestApp>
{
    private static Task<HttpResponseMessage> PutPlace(TripsApi api, Guid id, Guid tripId, object? overrides = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["tripId"] = tripId,
            ["name"] = "Mercado de San Telmo",
            ["category"] = "eat",
            ["notes"] = "Los domingos hay feria",
            ["url"] = "https://maps.google.com/?q=San+Telmo",
            ["address"] = null,
            ["visited"] = false,
        };
        if (overrides is not null)
        {
            foreach (var property in overrides.GetType().GetProperties())
            {
                body[property.Name] = property.GetValue(overrides);
            }
        }

        return api.Client.PutAsJsonAsync($"/api/places/{id}", body);
    }

    private static async Task<JsonElement[]> Places(TripsApi api, long since = 0)
    {
        var sync = await api.Client.GetFromJsonAsync<JsonElement>($"/api/sync?since={since}");
        return sync.GetProperty("places").EnumerateArray().ToArray();
    }

    [Fact]
    public async Task A_place_is_saved_synced_updated_and_deleted()
    {
        var ana = await TripsApi.SignUp(app, "lugares1-ana@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Argentina")).EnsureSuccessStatusCode();
        var placeId = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NoContent, (await PutPlace(ana, placeId, tripId)).StatusCode);
        var place = Assert.Single(await Places(ana));
        Assert.Equal("Mercado de San Telmo", place.GetProperty("name").GetString());
        Assert.Equal("eat", place.GetProperty("category").GetString());
        Assert.False(place.GetProperty("visited").GetBoolean());
        var version = place.GetProperty("version").GetInt64();

        (await PutPlace(ana, placeId, tripId, new { visited = true })).EnsureSuccessStatusCode();
        var updated = Assert.Single(await Places(ana, version));
        Assert.True(updated.GetProperty("visited").GetBoolean());

        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.DeleteAsync($"/api/places/{placeId}")).StatusCode);
        var deleted = Assert.Single(await Places(ana, updated.GetProperty("version").GetInt64()));
        Assert.NotEqual(JsonValueKind.Null, deleted.GetProperty("deletedAtMs").ValueKind);
        Assert.Equal(HttpStatusCode.Conflict, (await PutPlace(ana, placeId, tripId)).StatusCode);
    }

    [Fact]
    public async Task Bad_names_categories_and_links_are_refused()
    {
        var ana = await TripsApi.SignUp(app, "lugares2-ana@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Brasil")).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.BadRequest, (await PutPlace(ana, Guid.NewGuid(), tripId, new { name = "  " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PutPlace(ana, Guid.NewGuid(), tripId, new { category = "fiesta" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PutPlace(ana, Guid.NewGuid(), tripId, new { url = "javascript:alert(1)" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PutPlace(ana, Guid.NewGuid(), tripId, new { url = (string?)null, category = (string?)null })).StatusCode);
    }

    [Fact]
    public async Task Another_household_cannot_see_or_touch_the_places_and_deleting_the_trip_removes_them()
    {
        var ana = await TripsApi.SignUp(app, "lugares3-ana@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Chile")).EnsureSuccessStatusCode();
        var placeId = Guid.NewGuid();
        (await PutPlace(ana, placeId, tripId)).EnsureSuccessStatusCode();

        var luis = await TripsApi.SignUp(app, "lugares3-luis@example.com");
        Assert.Empty(await Places(luis));
        Assert.Equal(HttpStatusCode.NotFound, (await PutPlace(luis, Guid.NewGuid(), tripId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PutPlace(luis, placeId, tripId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.DeleteAsync($"/api/places/{placeId}")).StatusCode);

        (await ana.DeleteTrip(tripId)).EnsureSuccessStatusCode();
        var place = Assert.Single(await Places(ana));
        Assert.NotEqual(JsonValueKind.Null, place.GetProperty("deletedAtMs").ValueKind);
    }
}
