using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Viajes.Tests;

public sealed class DocumentTests(TestApp app) : IClassFixture<TestApp>
{
    private async Task<(TripsApi Admin, TripsApi Bea)> Household(string prefix)
    {
        var admin = await TripsApi.SignUp(app, $"{prefix}-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var invitation = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = $"{prefix}-bea@example.com", password = Auth.Password, invitation })).EnsureSuccessStatusCode();
        return (admin, new TripsApi(client));
    }

    private static Task<HttpResponseMessage> Put(TripsApi api, Guid id, object body) => api.Client.PutAsJsonAsync($"/api/documents/{id}", body);

    private static async Task<(JsonElement[] Documents, Guid[] Ids)> Sync(TripsApi api)
    {
        var body = await api.Client.GetFromJsonAsync<JsonElement>("/api/sync?since=0");
        return (body.GetProperty("documents").EnumerateArray().ToArray(), body.GetProperty("documentIds").EnumerateArray().Select(e => e.GetGuid()).ToArray());
    }

    [Fact]
    public async Task Documents_are_shared_with_the_household_unless_kept_private()
    {
        var (admin, bea) = await Household("documentos1");
        var passport = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await Put(admin, passport, new { person = "Paco", kind = "passport", number = "PAA123456", country = "España", expiryDate = "2027-03-01" })).StatusCode);

        var (docs, ids) = await Sync(bea);
        var seen = Assert.Single(docs);
        Assert.Equal("Paco", seen.GetProperty("person").GetString());
        Assert.Equal("2027-03-01", seen.GetProperty("expiryDate").GetString());
        Assert.Equal([passport], ids);

        // Uno privado de Bea: quien administra no lo ve, ni puede tocarlo.
        var insurance = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await Put(bea, insurance, new { person = "Bea", kind = "insurance", visibility = "private" })).StatusCode);
        Assert.Equal([passport], (await Sync(admin)).Ids);
        Assert.Equal(HttpStatusCode.NotFound, (await Put(admin, insurance, new { person = "Bea", kind = "insurance" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.DeleteAsync($"/api/documents/{insurance}")).StatusCode);

        // Bea puede corregir el pasaporte de Paco, pero no hacerlo privado (eso solo lo decide quien lo apuntó).
        Assert.Equal(HttpStatusCode.NoContent, (await Put(bea, passport, new { person = "Paco", kind = "passport", expiryDate = "2031-03-01", visibility = "private" })).StatusCode);
        var updated = (await Sync(admin)).Documents.Single(d => d.GetProperty("id").GetGuid() == passport);
        Assert.Equal("household", updated.GetProperty("visibility").GetString());
        Assert.Equal("2031-03-01", updated.GetProperty("expiryDate").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await Put(admin, Guid.NewGuid(), new { person = "Paco", kind = "passport", expiryDate = "01/03/2027" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(admin, Guid.NewGuid(), new { person = " ", kind = "passport" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(admin, Guid.NewGuid(), new { person = "Paco", kind = "carnet-de-la-biblioteca" })).StatusCode);
    }

    [Fact]
    public async Task A_document_keeps_its_photo_as_an_attachment_and_deleting_it_removes_both()
    {
        var (admin, bea) = await Household("documentos2");
        var passport = Guid.NewGuid();
        (await Put(admin, passport, new { person = "Paco", kind = "passport" })).EnsureSuccessStatusCode();

        var photo = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAttachment(photo, passport, "pasaporte.jpg", "image/jpeg", 3)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutContent(photo, new byte[] { 1, 2, 3 }, "image/jpeg")).StatusCode);

        // Bea la ve (y se baja) porque ve el documento.
        var fromBea = await bea.GetContent(photo);
        Assert.Equal(HttpStatusCode.OK, fromBea.StatusCode);
        Assert.Equal(new byte[] { 1, 2, 3 }, await fromBea.Content.ReadAsByteArrayAsync());
        var sync = await bea.Client.GetFromJsonAsync<JsonElement>("/api/sync?since=0");
        Assert.Contains(sync.GetProperty("attachments").EnumerateArray(), a => a.GetProperty("id").GetGuid() == photo && a.GetProperty("bookingId").GetGuid() == passport);

        // Alguien de fuera del hogar no puede colgar nada en él.
        var luis = await TripsApi.SignUp(app, "documentos2-luis@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await luis.PutAttachment(Guid.NewGuid(), passport)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await luis.GetContent(photo)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await bea.Client.DeleteAsync($"/api/documents/{passport}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetContent(photo)).StatusCode);
        var (docs, ids) = await Sync(admin);
        Assert.True(Assert.Single(docs).GetProperty("deletedAtMs").GetInt64() > 0);
        Assert.Empty(ids);
    }
}
