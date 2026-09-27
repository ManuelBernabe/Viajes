using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Viajes.Api.Data;

namespace Viajes.Tests;

public sealed class HouseholdTests(TestApp app) : IClassFixture<TestApp>
{
    private static async Task<string> Invite(TripsApi api)
    {
        var response = await api.Client.PostAsJsonAsync("/api/household/invitations", new { });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("token").GetString()!;
    }

    private static async Task<TripsApi> SignUpWithInvitation(TestApp app, string email, string token)
    {
        var client = app.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email, password = Auth.Password, invitation = token });
        response.EnsureSuccessStatusCode();
        return new TripsApi(client);
    }

    private static async Task<JsonElement> Household(TripsApi api) =>
        await api.Client.GetFromJsonAsync<JsonElement>("/api/household/");

    [Fact]
    public async Task An_invited_person_creates_an_account_without_the_code_and_sees_the_trips()
    {
        var ana = await TripsApi.SignUp(app, "hogar-ana@example.com");
        var tripId = Guid.NewGuid();
        await ana.PutTrip(tripId, "Argentina");
        var token = await Invite(ana);

        var lookup = await app.CreateHttpsClient().GetFromJsonAsync<JsonElement>($"/api/invitations/{token}");
        Assert.Equal("valid", lookup.GetProperty("state").GetString());
        Assert.Equal("hogar-ana@example.com", lookup.GetProperty("invitedBy").GetString());

        var bea = await SignUpWithInvitation(app, "hogar-bea@example.com", token);

        var sync = await bea.GetSync();
        Assert.Equal([tripId], sync.TripIds);
        var home = await Household(bea);
        Assert.False(home.GetProperty("iAmAdmin").GetBoolean());
        Assert.Equal(2, home.GetProperty("members").GetArrayLength());
        Assert.Empty(home.GetProperty("invitations").EnumerateArray());
        var again = await app.CreateHttpsClient().GetFromJsonAsync<JsonElement>($"/api/invitations/{token}");
        Assert.Equal("used", again.GetProperty("state").GetString());
    }

    [Fact]
    public async Task An_existing_account_joins_by_accepting_and_a_used_token_is_rejected()
    {
        var ana = await TripsApi.SignUp(app, "hogar2-ana@example.com");
        await ana.PutTrip(Guid.NewGuid(), "Brasil");
        var token = await Invite(ana);
        var carlos = await TripsApi.SignUp(app, "hogar2-carlos@example.com");
        Assert.Empty((await carlos.GetSync()).TripIds);

        var accept = await carlos.Client.PostAsJsonAsync($"/api/invitations/{token}/accept", new { });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        Assert.Single((await carlos.GetSync()).TripIds);

        var dora = await TripsApi.SignUp(app, "hogar2-dora@example.com");
        var second = await dora.Client.PostAsJsonAsync($"/api/invitations/{token}/accept", new { });
        Assert.Equal(HttpStatusCode.Gone, second.StatusCode);
        Assert.Empty((await dora.GetSync()).TripIds);
    }

    [Fact]
    public async Task Members_can_invite_too_but_only_the_admin_removes_and_a_removed_member_loses_access()
    {
        var ana = await TripsApi.SignUp(app, "hogar3-ana@example.com");
        var tripId = Guid.NewGuid();
        await ana.PutTrip(tripId);
        var bea = await SignUpWithInvitation(app, "hogar3-bea@example.com", await Invite(ana));

        // Bea, miembro sin ser administradora, invita a Carlos.
        var carlos = await SignUpWithInvitation(app, "hogar3-carlos@example.com", await Invite(bea));
        Assert.Equal([tripId], (await carlos.GetSync()).TripIds);

        var carlosId = (await Household(carlos)).GetProperty("members").EnumerateArray()
            .Single(m => m.GetProperty("me").GetBoolean()).GetProperty("userId").GetString();
        Assert.Equal(HttpStatusCode.Forbidden, (await bea.Client.DeleteAsync($"/api/household/members/{carlosId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.DeleteAsync($"/api/household/members/{carlosId}")).StatusCode);

        Assert.Empty((await carlos.GetSync()).TripIds);
        Assert.Equal(2, (await Household(ana)).GetProperty("members").GetArrayLength());
        // Carlos vuelve a tener un hogar propio, vacío, donde puede crear sus viajes.
        Assert.Equal(HttpStatusCode.NoContent, (await carlos.PutTrip(Guid.NewGuid(), "Propio")).StatusCode);
        Assert.Single((await carlos.GetSync()).TripIds);
    }

    [Fact]
    public async Task Revoked_or_expired_invitations_are_refused_and_accounts_with_trips_cannot_join()
    {
        var ana = await TripsApi.SignUp(app, "hogar4-ana@example.com");
        var revokeToken = await Invite(ana);
        var pending = (await Household(ana)).GetProperty("invitations").EnumerateArray().Single();
        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.DeleteAsync($"/api/household/invitations/{pending.GetProperty("id").GetGuid()}")).StatusCode);
        var revoked = await app.CreateHttpsClient().GetFromJsonAsync<JsonElement>($"/api/invitations/{revokeToken}");
        Assert.Equal("revoked", revoked.GetProperty("state").GetString());
        var register = await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/register", new { email = "hogar4-x@example.com", password = Auth.Password, invitation = revokeToken });
        Assert.Equal(HttpStatusCode.Gone, register.StatusCode);

        var expiredToken = await Invite(ana);
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hash = Viajes.Api.Households.InvitationService.Hash(expiredToken);
            await db.Invitations.Where(i => i.TokenHash == hash).ExecuteUpdateAsync(s => s.SetProperty(i => i.ExpiresMs, 1));
        }

        var expired = await app.CreateHttpsClient().GetFromJsonAsync<JsonElement>($"/api/invitations/{expiredToken}");
        Assert.Equal("expired", expired.GetProperty("state").GetString());
        var unknown = await app.CreateHttpsClient().GetFromJsonAsync<JsonElement>("/api/invitations/no-existe");
        Assert.Equal("unknown", unknown.GetProperty("state").GetString());

        var busy = await TripsApi.SignUp(app, "hogar4-ocupada@example.com");
        await busy.PutTrip(Guid.NewGuid(), "Mío");
        var conflict = await busy.Client.PostAsJsonAsync($"/api/invitations/{await Invite(ana)}/accept", new { });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
    }
}

public sealed class AdminOnlySettingsTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Only_the_admin_creates_and_revokes_tokens()
    {
        var admin = await TripsApi.SignUp(app, "solo-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var token = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var member = app.CreateHttpsClient();
        (await member.PostAsJsonAsync("/api/auth/register", new { email = "solo-miembro@example.com", password = Auth.Password, invitation = token })).EnsureSuccessStatusCode();

        var created = await admin.Client.PostAsJsonAsync("/api/import-tokens/", new { label = "Gmail" });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/import-tokens/", new { label = "Gmail" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/import-tokens/", new { label = "Copia", scope = "backup" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.DeleteAsync($"/api/import-tokens/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.DeleteAsync($"/api/import-tokens/{id}")).StatusCode);
    }
}
