using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class LockStatusTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Each_member_reports_face_id_and_the_household_shows_it()
    {
        var admin = await TripsApi.SignUp(app, "faceid-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var invitation = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var bea = app.CreateHttpsClient();
        (await bea.PostAsJsonAsync("/api/auth/register", new { email = "faceid-bea@example.com", password = Auth.Password, invitation })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.PostAsJsonAsync("/api/household/lock-status", new { enabled = true, supported = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await bea.PostAsJsonAsync("/api/household/lock-status", new { enabled = false, supported = true })).StatusCode);
        // Desde un ordenador sin Face ID no se pisa el «activado» del móvil.
        await admin.Client.PostAsJsonAsync("/api/household/lock-status", new { enabled = false, supported = false });

        var home = await admin.Client.GetFromJsonAsync<JsonElement>("/api/household");
        var faceId = home.GetProperty("members").EnumerateArray().ToDictionary(m => m.GetProperty("email").GetString()!, m => m.GetProperty("faceId").GetString());
        Assert.Equal("on", faceId["faceid-admin@example.com"]);
        Assert.Equal("off", faceId["faceid-bea@example.com"]);
    }
}
