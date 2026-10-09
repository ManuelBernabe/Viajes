using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class EmergencyCardTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task The_emergency_card_is_shared_by_the_household_and_cleaned()
    {
        var ana = await TripsApi.SignUp(app, "emergencia1@example.com");
        var empty = await ana.Client.GetFromJsonAsync<JsonElement>("/api/household/emergency");
        Assert.Equal(0, empty.GetProperty("contacts").GetArrayLength());

        var saved = await ana.Client.PutAsJsonAsync("/api/household/emergency", new
        {
            insurance = new { company = " Seguro Viaje ", phone = "+34 900 000 000", policy = "P-1" },
            contacts = new object[] { new { name = "Luis", relation = "Hermano", phone = "+34 600 000 000" }, new { name = "", phone = "" } },
            people = new object[] { new { name = "Paco", blood = "A+", allergies = "Penicilina" }, new { name = "Sin datos" } },
        });
        saved.EnsureSuccessStatusCode();

        // Quien entra con invitación en el mismo hogar ve la misma tarjeta.
        var invitation = (await (await ana.Client.PostAsJsonAsync("/api/household/invitations", new { })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = "emergencia2@example.com", password = Auth.Password, invitation })).EnsureSuccessStatusCode();
        var card = await client.GetFromJsonAsync<JsonElement>("/api/household/emergency");
        Assert.Equal("Seguro Viaje", card.GetProperty("insurance").GetProperty("company").GetString());
        Assert.Equal(["Luis"], card.GetProperty("contacts").EnumerateArray().Select(c => c.GetProperty("name").GetString()));
        Assert.Equal(["Paco"], card.GetProperty("people").EnumerateArray().Select(p => p.GetProperty("name").GetString()));
        Assert.Equal("emergencia1@example.com", card.GetProperty("updatedBy").GetString());

        // Otro hogar no la ve.
        var other = await TripsApi.SignUp(app, "emergencia3@example.com");
        var theirs = await other.Client.GetFromJsonAsync<JsonElement>("/api/household/emergency");
        Assert.Equal(0, theirs.GetProperty("contacts").GetArrayLength());
    }
}
