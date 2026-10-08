using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class PackingTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task The_packing_list_is_shared_without_repeats_and_items_can_be_ticked()
    {
        var ana = await TripsApi.SignUp(app, "equipaje1@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Playa")).EnsureSuccessStatusCode();

        var added = await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/packing", new
        {
            items = new object[]
            {
                new { text = "Bañador", category = "Ropa" }, new { text = "  Crema solar ", category = "Aseo" }, new { text = "bañador", category = "Ropa" },
                new { text = "Pasaporte", category = "Documentos", forWhom = "Paco" }, new { text = "" },
            },
        });
        Assert.Equal(HttpStatusCode.OK, added.StatusCode);
        var items = (await added.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToArray();
        Assert.Equal(["Bañador", "Crema solar", "Pasaporte"], items.Select(i => i.GetProperty("text").GetString()));

        var id = items[0].GetProperty("id").GetGuid();
        var ticked = await (await ana.Client.PatchAsJsonAsync($"/api/packing/{id}", new { @checked = true })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(ticked.GetProperty("checked").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.DeleteAsync($"/api/packing/{items[1].GetProperty("id").GetGuid()}")).StatusCode);

        var list = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/packing");
        Assert.Equal(2, list.GetArrayLength());

        // Otro hogar no ve ni toca la lista.
        var other = await TripsApi.SignUp(app, "equipaje2@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/trips/{tripId}/packing")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.PatchAsJsonAsync($"/api/packing/{id}", new { @checked = false })).StatusCode);
    }
}
