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
    public async Task Accepting_right_after_signing_up_with_the_invitation_confirms_instead_of_failing()
    {
        // La página de invitación crea la cuenta con el token y justo después llama a /accept.
        var ana = await TripsApi.SignUp(app, "hogar5-ana@example.com");
        await ana.PutTrip(Guid.NewGuid(), "Chile");
        var token = await Invite(ana);

        var bea = await SignUpWithInvitation(app, "hogar5-bea@example.com", token);
        var accept = await bea.Client.PostAsJsonAsync($"/api/invitations/{token}/accept", new { });

        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        var body = await accept.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("alreadyMember").GetBoolean());
        Assert.Single((await bea.GetSync()).TripIds);
    }

    [Fact]
    public async Task A_second_link_opened_by_someone_already_in_the_household_stops_being_pending()
    {
        var ana = await TripsApi.SignUp(app, "hogar6-ana@example.com");
        var bea = await SignUpWithInvitation(app, "hogar6-bea@example.com", await Invite(ana));
        var second = await Invite(ana);
        Assert.Single((await Household(ana)).GetProperty("invitations").EnumerateArray());

        var accept = await bea.Client.PostAsJsonAsync($"/api/invitations/{second}/accept", new { });

        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        Assert.Empty((await Household(ana)).GetProperty("invitations").EnumerateArray());
        var lookup = await app.CreateHttpsClient().GetFromJsonAsync<JsonElement>($"/api/invitations/{second}");
        Assert.Equal("used", lookup.GetProperty("state").GetString());
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

public sealed class SharedHouseholdDataTests(TestApp app) : IClassFixture<TestApp>
{
    private static async Task<TripsApi> Join(TestApp app, TripsApi admin, string email)
    {
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var token = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email, password = Auth.Password, invitation = token })).EnsureSuccessStatusCode();
        return new TripsApi(client);
    }

    [Fact]
    public async Task Admin_bookings_are_shared_and_a_members_bookings_are_seen_only_by_that_member_and_the_admin()
    {
        var admin = await TripsApi.SignUp(app, "compartido-admin@example.com");
        var tripId = Guid.NewGuid();
        var adminBooking = Guid.NewGuid();
        await admin.PutTrip(tripId, "Viaje del administrador");
        await admin.PutBooking(adminBooking, tripId, new { title = "Vuelo común" });
        var ana = await Join(app, admin, "compartido-ana@example.com");
        var luis = await Join(app, admin, "compartido-luis@example.com");

        // Ana añade una reserva al viaje común y crea un viaje nuevo con otra reserva.
        var anaInAdminTrip = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PutBooking(anaInAdminTrip, tripId, new { title = "Hotel de Ana" })).StatusCode);
        var anaTrip = Guid.NewGuid();
        var anaBooking = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PutTrip(anaTrip, "Viaje de Ana")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PutBooking(anaBooking, anaTrip, new { title = "Vuelo de Ana" })).StatusCode);

        // Los viajes son del hogar: los ven los tres.
        foreach (var api in new[] { admin, ana, luis })
        {
            Assert.Equal(2, (await api.GetSync()).TripIds.Count);
        }

        // El administrador ve todo; Ana ve lo común y lo suyo; Luis ve lo común pero no lo de Ana.
        var adminSees = (await admin.GetSync()).Bookings.Select(b => b.Id).ToHashSet();
        Assert.True(adminSees.IsSupersetOf([adminBooking, anaInAdminTrip, anaBooking]));
        var anaSees = (await ana.GetSync()).Bookings.Select(b => b.Id).ToHashSet();
        Assert.True(anaSees.IsSupersetOf([adminBooking, anaInAdminTrip, anaBooking]));
        var luisSees = (await luis.GetSync()).Bookings.Select(b => b.Id).ToHashSet();
        Assert.Contains(adminBooking, luisSees);
        Assert.DoesNotContain(anaInAdminTrip, luisSees);
        Assert.DoesNotContain(anaBooking, luisSees);

        // Luis no puede pisar ni borrar la reserva de Ana aunque conozca su id; el administrador sí puede editarla.
        Assert.Equal(HttpStatusCode.NotFound, (await luis.PutBooking(anaBooking, anaTrip, new { title = "Intento de Luis" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await luis.DeleteBooking(anaBooking)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutBooking(anaBooking, anaTrip, new { title = "Vuelo de Ana (revisado)" })).StatusCode);
        Assert.Contains((await ana.GetSync()).Bookings, b => b.Id == anaBooking && b.Title == "Vuelo de Ana (revisado)");

        // Si Ana comparte una reserva con todo el hogar, Luis pasa a verla (y a poder editarla); si vuelve a privada, deja de verla.
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PutBooking(anaInAdminTrip, tripId, new { title = "Hotel de Ana", visibility = "household" })).StatusCode);
        Assert.Contains((await luis.GetSync()).Bookings, b => b.Id == anaInAdminTrip);
        Assert.Equal(HttpStatusCode.NoContent, (await luis.PutBooking(anaInAdminTrip, tripId, new { title = "Hotel de Ana (visto por Luis)" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PutBooking(anaInAdminTrip, tripId, new { title = "Hotel de Ana", visibility = "private" })).StatusCode);
        Assert.DoesNotContain((await luis.GetSync()).Bookings.Where(b => b.DeletedAtMs == null), b => b.Id == anaInAdminTrip);

        // El administrador restringe su vuelo común a «solo yo»: nadie más lo ve; luego lo comparte solo con Luis.
        var luisId = (await luis.Client.GetFromJsonAsync<JsonElement>("/api/household/")).GetProperty("members").EnumerateArray()
            .Single(m => m.GetProperty("me").GetBoolean()).GetProperty("userId").GetString()!;
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutBooking(adminBooking, tripId, new { title = "Vuelo común", visibility = "private" })).StatusCode);
        Assert.DoesNotContain((await ana.GetSync()).Bookings.Where(b => b.DeletedAtMs == null), b => b.Id == adminBooking);
        Assert.DoesNotContain((await luis.GetSync()).Bookings.Where(b => b.DeletedAtMs == null), b => b.Id == adminBooking);
        // La lista completa de reservas visibles es lo que permite al móvil de Luis purgar la copia que ya tenía.
        Assert.DoesNotContain(adminBooking, (await luis.GetSync()).BookingIds);
        Assert.Contains(adminBooking, (await admin.GetSync()).BookingIds);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutBooking(adminBooking, tripId, new { title = "Vuelo común", visibility = "some", sharedWith = new[] { luisId, "nadie" } })).StatusCode);
        var luisView = (await luis.GetSync()).Bookings.Single(b => b.Id == adminBooking);
        Assert.Equal("some", luisView.Visibility);
        Assert.Equal([luisId], luisView.SharedWith);
        Assert.DoesNotContain((await ana.GetSync()).Bookings.Where(b => b.DeletedAtMs == null), b => b.Id == adminBooking);
        // Luis la ve, pero no puede cambiar quién la ve.
        Assert.Equal(HttpStatusCode.NoContent, (await luis.PutBooking(adminBooking, tripId, new { title = "Vuelo común", visibility = "household" })).StatusCode);
        Assert.DoesNotContain((await ana.GetSync()).Bookings.Where(b => b.DeletedAtMs == null), b => b.Id == adminBooking);

        // Alguien de otro hogar no ve nada de esto.
        var outsider = await TripsApi.SignUp(app, "compartido-ajeno@example.com");
        Assert.Empty((await outsider.GetSync()).TripIds);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PutBooking(Guid.NewGuid(), tripId)).StatusCode);
    }
}
