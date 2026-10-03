using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class ForgotPasswordTests(TestApp app) : IClassFixture<TestApp>
{
    private const string NewPassword = "Olvidada2026ok";

    /// <summary>Hogar con script de Gmail (token de importación) y una persona invitada.</summary>
    private async Task<(TripsApi Admin, string ScriptToken, string MemberEmail, string MemberId)> Household(string prefix)
    {
        var admin = await TripsApi.SignUp(app, $"{prefix}-admin@example.com");
        var created = await admin.Client.PostAsJsonAsync("/api/import-tokens/", new { label = "Gmail", scope = "import" });
        created.EnsureSuccessStatusCode();
        var scriptToken = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;

        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var invitation = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var memberEmail = $"{prefix}-david@example.com";
        (await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/register", new { email = memberEmail, password = Auth.Password, invitation })).EnsureSuccessStatusCode();
        var home = await admin.Client.GetFromJsonAsync<JsonElement>("/api/household/");
        var memberId = home.GetProperty("members").EnumerateArray().First(m => !m.GetProperty("me").GetBoolean()).GetProperty("userId").GetString()!;
        return (admin, scriptToken, memberEmail, memberId);
    }

    private async Task<JsonElement> Pending(string scriptToken)
    {
        var client = app.CreateHttpsClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", scriptToken);
        var response = await client.GetAsync("/api/mail/pending");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private Task<HttpResponseMessage> Forgot(string email) =>
        app.CreateHttpsClient().PostAsJsonAsync("/api/auth/forgot", new { email });

    private static (string UserId, string Token) Parse(string path)
    {
        var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal("restablecer", parts[0]);
        return (Uri.UnescapeDataString(parts[1]), parts[2]);
    }

    [Fact]
    public async Task A_member_asks_for_a_link_the_script_mails_it_and_it_sets_the_new_password()
    {
        var (_, scriptToken, email, memberId) = await Household("olvido1");

        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(email)).StatusCode);

        var mails = await Pending(scriptToken);
        var mail = Assert.Single(mails.EnumerateArray());
        Assert.Equal(email, mail.GetProperty("to").GetString());
        var (userId, token) = Parse(mail.GetProperty("path").GetString()!);
        Assert.Equal(memberId, userId);
        Assert.Empty((await Pending(scriptToken)).EnumerateArray());

        var client = app.CreateHttpsClient();
        var reset = await client.PostAsJsonAsync("/api/auth/password-reset", new { userId, token, password = NewPassword });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/login", new { email, password = NewPassword })).StatusCode);
    }

    [Fact]
    public async Task Someone_removed_from_the_household_still_gets_the_mail_from_that_household()
    {
        var (admin, scriptToken, email, memberId) = await Household("olvido2");
        (await admin.Client.DeleteAsync($"/api/household/members/{memberId}")).EnsureSuccessStatusCode();
        // Al entrar después de que lo saquen, la cuenta queda en un hogar propio vacío (sin script).
        (await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/login", new { email, password = Auth.Password })).EnsureSuccessStatusCode();

        await Forgot(email);

        var mail = Assert.Single((await Pending(scriptToken)).EnumerateArray());
        Assert.Equal(email, mail.GetProperty("to").GetString());
    }

    [Fact]
    public async Task Unknown_emails_answer_the_same_and_queue_nothing_and_repeats_are_throttled()
    {
        var (_, scriptToken, email, _) = await Household("olvido3");

        Assert.Equal(HttpStatusCode.NoContent, (await Forgot("nadie-olvido3@example.com")).StatusCode);
        Assert.Empty((await Pending(scriptToken)).EnumerateArray());

        await Forgot(email);
        await Forgot(email);
        await Forgot(email);
        Assert.Single((await Pending(scriptToken)).EnumerateArray());
    }

    [Fact]
    public async Task Another_households_script_never_sees_the_mail_and_bad_tokens_are_refused()
    {
        var (_, _, email, _) = await Household("olvido4");
        var (_, otherScript, _, _) = await Household("olvido4b");

        await Forgot(email);
        Assert.Empty((await Pending(otherScript)).EnumerateArray());

        var client = app.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/mail/pending")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "inventado");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/mail/pending")).StatusCode);
    }
}
