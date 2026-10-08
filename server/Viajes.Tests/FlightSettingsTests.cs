using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Viajes.Api.Flights;

namespace Viajes.Tests;

public sealed class FlightSettingsTests(TestApp app) : IClassFixture<TestApp>
{
    private const string RapidApiKey = "0123456789abcdefmsh0123456789abcdefp1jsn0123456789ab";

    [Fact]
    public async Task The_admin_pastes_the_key_in_the_app_and_it_turns_flight_status_on()
    {
        var admin = await TripsApi.SignUp(app, "clave-vuelos@example.com");
        var before = await admin.Client.GetFromJsonAsync<JsonElement>("/api/settings/flight-status");
        Assert.False(before.GetProperty("configured").GetBoolean());

        // Lo que se copia de una clave oculta son puntos: se rechaza con una explicación.
        var dots = await admin.Client.PutAsJsonAsync("/api/settings/flight-status", new { key = new string('•', 50) });
        Assert.Equal(HttpStatusCode.BadRequest, dots.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.PutAsJsonAsync("/api/settings/flight-status", new { key = $"  {RapidApiKey} " })).StatusCode);
        var after = await admin.Client.GetFromJsonAsync<JsonElement>("/api/settings/flight-status");
        Assert.True(after.GetProperty("configured").GetBoolean());
        Assert.Equal("app", after.GetProperty("origin").GetString());
        Assert.Equal("AeroDataBox", after.GetProperty("provider").GetString());
        Assert.Equal("89ab", after.GetProperty("hint").GetString());

        // Guardada cifrada, no tal cual.
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Viajes.Api.Data.AppDbContext>();
            var stored = db.AppSettings.Single(s => s.Key == DynamicFlightSource.SettingKey).Value;
            Assert.DoesNotContain("msh", stored);
        }

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.DeleteAsync("/api/settings/flight-status")).StatusCode);
        var removed = await admin.Client.GetFromJsonAsync<JsonElement>("/api/settings/flight-status");
        Assert.False(removed.GetProperty("configured").GetBoolean());
    }

    [Fact]
    public async Task Only_the_admin_can_see_or_change_the_key()
    {
        var admin = await TripsApi.SignUp(app, "clave-vuelos-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var invitation = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = "clave-vuelos-bea@example.com", password = Auth.Password, invitation })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/settings/flight-status")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/settings/flight-status", new { key = RapidApiKey })).StatusCode);
    }

    [Fact]
    public void RapidApi_keys_are_told_apart_from_FlightAware_ones()
    {
        Assert.True(DynamicFlightSource.IsRapidApiKey(RapidApiKey));
        Assert.False(DynamicFlightSource.IsRapidApiKey("AbCdEfGhIjKlMnOpQrStUvWxYz012345"));
    }
}
