using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class FormerMemberTests(TestApp app) : IClassFixture<TestApp>
{
    private static async Task<string> Invite(TripsApi admin)
    {
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        return (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    }

    private async Task<HttpResponseMessage> Register(string email, string password, string invitation) =>
        await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/register", new { email, password, invitation });

    private static async Task<JsonElement> Home(TripsApi api) => await api.Client.GetFromJsonAsync<JsonElement>("/api/household/");

    private static string IdOf(JsonElement home, string email) =>
        home.GetProperty("members").EnumerateArray().First(m => m.GetProperty("email").GetString() == email).GetProperty("userId").GetString()!;

    [Fact]
    public async Task The_admin_deletes_a_removed_members_account_and_the_same_email_signs_up_again()
    {
        var admin = await TripsApi.SignUp(app, "antiguo1-admin@example.com");
        await admin.PutTrip(Guid.NewGuid(), "Roma");
        const string david = "antiguo1-david@example.com";
        (await Register(david, Auth.Password, await Invite(admin))).EnsureSuccessStatusCode();
        var davidId = IdOf(await Home(admin), david);
        (await admin.Client.DeleteAsync($"/api/household/members/{davidId}")).EnsureSuccessStatusCode();

        var former = Assert.Single((await Home(admin)).GetProperty("formerMembers").EnumerateArray());
        Assert.Equal(david, former.GetProperty("email").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.DeleteAsync($"/api/household/former-members/{davidId}")).StatusCode);
        Assert.Empty((await Home(admin)).GetProperty("formerMembers").EnumerateArray());
        var oldLogin = await app.CreateHttpsClient().PostAsJsonAsync("/api/auth/login", new { email = david, password = Auth.Password });
        Assert.NotEqual(HttpStatusCode.OK, oldLogin.StatusCode);

        // El mismo email vuelve a darse de alta con la invitación y una contraseña nueva, y ve los viajes del hogar.
        var client = app.CreateHttpsClient();
        var again = await client.PostAsJsonAsync("/api/auth/register", new { email = david, password = "OtraNueva2026", invitation = await Invite(admin) });
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Single((await new TripsApi(client).GetSync()).TripIds);
        Assert.Equal(2, (await Home(admin)).GetProperty("members").GetArrayLength());
    }

    [Fact]
    public async Task Only_the_admin_and_only_for_people_who_left()
    {
        var admin = await TripsApi.SignUp(app, "antiguo2-admin@example.com");
        const string bea = "antiguo2-bea@example.com";
        var beaClient = app.CreateHttpsClient();
        (await beaClient.PostAsJsonAsync("/api/auth/register", new { email = bea, password = Auth.Password, invitation = await Invite(admin) })).EnsureSuccessStatusCode();
        var beaId = IdOf(await Home(admin), bea);

        // Sigue en el hogar: no es «antigua».
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.DeleteAsync($"/api/household/former-members/{beaId}")).StatusCode);

        const string luis = "antiguo2-luis@example.com";
        (await Register(luis, Auth.Password, await Invite(admin))).EnsureSuccessStatusCode();
        var luisId = IdOf(await Home(admin), luis);
        (await admin.Client.DeleteAsync($"/api/household/members/{luisId}")).EnsureSuccessStatusCode();
        Assert.Empty((await beaClient.GetFromJsonAsync<JsonElement>("/api/household/")).GetProperty("formerMembers").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await beaClient.DeleteAsync($"/api/household/former-members/{luisId}")).StatusCode);

        // Un desconocido que nunca estuvo en el hogar.
        var stranger = await TripsApi.SignUp(app, "antiguo2-fuera@example.com");
        var strangerId = (await Home(stranger)).GetProperty("members")[0].GetProperty("userId").GetString();
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.DeleteAsync($"/api/household/former-members/{strangerId}")).StatusCode);
    }
}
