using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class PasswordResetTests(TestApp app) : IClassFixture<TestApp>
{
    private const string NewPassword = "Nueva2026clave";

    /// <summary>Quien administra y una persona que entra con su invitación.</summary>
    private async Task<(TripsApi Admin, TripsApi Member, string MemberId)> Household(string prefix)
    {
        var admin = await TripsApi.SignUp(app, $"{prefix}-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var token = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = $"{prefix}-bea@example.com", password = Auth.Password, invitation = token })).EnsureSuccessStatusCode();
        var home = await admin.Client.GetFromJsonAsync<JsonElement>("/api/household/");
        var memberId = home.GetProperty("members").EnumerateArray().First(m => !m.GetProperty("me").GetBoolean()).GetProperty("userId").GetString()!;
        return (admin, new TripsApi(client), memberId);
    }

    private static async Task<string> Link(TripsApi admin, string userId)
    {
        var response = await admin.Client.PostAsJsonAsync($"/api/household/members/{userId}/password-reset", new { });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    }

    private Task<HttpResponseMessage> Login(string email, string password) =>
        app.CreateHttpsClient().PostAsJsonAsync("/api/auth/login", new { email, password });

    [Fact]
    public async Task The_admin_link_lets_a_member_set_a_new_password_once()
    {
        var (admin, _, memberId) = await Household("reset1");
        var token = await Link(admin, memberId);

        var stranger = app.CreateHttpsClient();
        var check = await stranger.PostAsJsonAsync("/api/auth/password-reset/check", new { userId = memberId, token });
        Assert.Equal(HttpStatusCode.OK, check.StatusCode);
        Assert.Equal("reset1-bea@example.com", (await check.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("email").GetString());

        var weak = await stranger.PostAsJsonAsync("/api/auth/password-reset", new { userId = memberId, token, password = "corta" });
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);

        var reset = await stranger.PostAsJsonAsync("/api/auth/password-reset", new { userId = memberId, token, password = NewPassword });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await stranger.GetAsync("/api/auth/me")).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Login("reset1-bea@example.com", Auth.Password)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login("reset1-bea@example.com", NewPassword)).StatusCode);

        var again = await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/password-reset", new { userId = memberId, token, password = "Otra2026clave" });
        Assert.Equal(HttpStatusCode.Gone, again.StatusCode);
        var recheck = await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/password-reset/check", new { userId = memberId, token });
        Assert.Equal(HttpStatusCode.Gone, recheck.StatusCode);
    }

    [Fact]
    public async Task A_locked_out_member_gets_in_with_the_link_without_waiting()
    {
        var (admin, _, memberId) = await Household("reset4");
        for (var i = 0; i < 5; i++)
        {
            await Login("reset4-bea@example.com", "Equivocada2026");
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login("reset4-bea@example.com", Auth.Password)).StatusCode);

        var token = await Link(admin, memberId);
        var client = app.CreateHttpsClient();
        var reset = await client.PostAsJsonAsync("/api/auth/password-reset", new { userId = memberId, token, password = NewPassword });

        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login("reset4-bea@example.com", NewPassword)).StatusCode);
    }

    [Fact]
    public async Task Only_the_admin_creates_links_and_only_for_members_of_the_household()
    {
        var (admin, member, memberId) = await Household("reset2");
        var home = await admin.Client.GetFromJsonAsync<JsonElement>("/api/household/");
        var adminId = home.GetProperty("members").EnumerateArray().First(m => m.GetProperty("me").GetBoolean()).GetProperty("userId").GetString();

        var byMember = await member.Client.PostAsJsonAsync($"/api/household/members/{adminId}/password-reset", new { });
        Assert.Equal(HttpStatusCode.Forbidden, byMember.StatusCode);

        var outsider = await TripsApi.SignUp(app, "reset2-fuera@example.com");
        var outsiderHome = await outsider.Client.GetFromJsonAsync<JsonElement>("/api/household/");
        var outsiderId = outsiderHome.GetProperty("members")[0].GetProperty("userId").GetString();
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsJsonAsync($"/api/household/members/{outsiderId}/password-reset", new { })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.PostAsJsonAsync($"/api/household/members/{adminId}/password-reset", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.Client.PostAsJsonAsync($"/api/household/members/{memberId}/password-reset", new { })).StatusCode);
    }

    [Fact]
    public async Task A_made_up_or_damaged_token_is_refused()
    {
        var (admin, _, memberId) = await Household("reset3");
        var token = await Link(admin, memberId);
        var client = app.CreateHttpsClient();

        foreach (var bad in new[] { "no-es-un-token", token[..^4] + "AAAA", "%%%" })
        {
            var response = await client.PostAsJsonAsync("/api/auth/password-reset", new { userId = memberId, token = bad, password = NewPassword });
            Assert.Equal(HttpStatusCode.Gone, response.StatusCode);
        }

        var wrongUser = await client.PostAsJsonAsync("/api/auth/password-reset", new { userId = "no-existe", token, password = NewPassword });
        Assert.Equal(HttpStatusCode.Gone, wrongUser.StatusCode);
    }
}
