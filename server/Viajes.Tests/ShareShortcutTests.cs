using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Viajes.Api.Inbox;

namespace Viajes.Tests;

public sealed class ShareShortcutTests(TestApp app) : IClassFixture<TestApp>
{
    private static async Task<(string Id, string Token)> ShareKey(TripsApi api)
    {
        var response = await api.Client.PostAsJsonAsync("/api/import-tokens/", new { scope = "share" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return (body.GetProperty("id").GetString()!, body.GetProperty("token").GetString()!);
    }

    private async Task<HttpResponseMessage> Send(string token, byte[] bytes, string? contentType, string? name)
    {
        var client = app.CreateHttpsClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/inbox/share") { Content = new ByteArrayContent(bytes) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (contentType is not null)
        {
            request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        }

        if (name is not null)
        {
            request.Headers.Add("X-File-Name", Uri.EscapeDataString(name));
        }

        return await client.SendAsync(request);
    }

    /// <summary>Alguien que no administra: la clave del atajo es personal y la puede crear cualquiera.</summary>
    private async Task<TripsApi> Member(string prefix)
    {
        var admin = await TripsApi.SignUp(app, $"{prefix}-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var invitation = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = $"{prefix}-bea@example.com", password = Auth.Password, invitation })).EnsureSuccessStatusCode();
        return new TripsApi(client);
    }

    [Fact]
    public async Task A_pdf_shared_from_the_iphone_lands_in_the_inbox_with_its_name()
    {
        var bea = await Member("atajo1");
        var (_, token) = await ShareKey(bea);

        // Sin Content-Type, como a veces lo manda Atajos: se reconoce por los primeros bytes.
        var response = await Send(token, "%PDF-1.4 billete de tren"u8.ToArray(), null, "Billete Renfe.pdf");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var inbox = (await bea.GetSyncFull()).Inbox;
        var item = Assert.Single(inbox);
        Assert.Equal("Billete Renfe", item.Subject);
        var attachment = Assert.Single(item.Attachments);
        Assert.Equal("Billete Renfe.pdf", attachment.Name);
        Assert.Equal("application/pdf", attachment.Mime);
    }

    [Fact]
    public async Task Shared_text_becomes_the_body_and_images_keep_their_type()
    {
        var bea = await Member("atajo2");
        var (_, token) = await ShareKey(bea);

        (await Send(token, Encoding.UTF8.GetBytes("Reserva confirmada. Localizador XK12QZ. Hotel Sol, 12/10/2026."), "text/plain", null)).EnsureSuccessStatusCode();
        (await Send(token, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0], "application/octet-stream", "captura")).EnsureSuccessStatusCode();

        var inbox = (await bea.GetSyncFull()).Inbox;
        Assert.Equal(2, inbox.Count);
        Assert.Contains(inbox, i => i.BodyText?.Contains("XK12QZ") == true && i.Attachments.Count == 0);
        var image = Assert.Single(inbox.SelectMany(i => i.Attachments));
        Assert.Equal("image/png", image.Mime);
        Assert.Equal("captura.png", image.Name);
    }

    [Fact]
    public async Task Bad_revoked_or_other_keys_are_refused_and_empty_bodies_too()
    {
        var bea = await Member("atajo3");
        var (id, token) = await ShareKey(bea);

        Assert.Equal(HttpStatusCode.BadRequest, (await Send(token, [], null, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send("inventada", "%PDF"u8.ToArray(), null, null)).StatusCode);

        // Quien no administra no puede crear claves del script de Gmail, pero sí revocar la suya del atajo.
        Assert.Equal(HttpStatusCode.Forbidden, (await bea.Client.PostAsJsonAsync("/api/import-tokens/", new { scope = "import" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await bea.Client.DeleteAsync($"/api/import-tokens/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(token, "%PDF"u8.ToArray(), null, null)).StatusCode);
    }

    [Theory]
    [InlineData(new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D }, null, "application/pdf")]
    [InlineData(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }, "application/octet-stream", "image/jpeg")]
    [InlineData(new byte[] { 0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0 }, null, "image/heic")]
    [InlineData(new byte[] { 0x48, 0x6F, 0x6C, 0x61 }, null, "text/plain")]
    [InlineData(new byte[] { 0x00, 0x01, 0x02, 0xFE }, null, "application/octet-stream")]
    public void The_type_comes_from_the_first_bytes(byte[] bytes, string? declared, string expected) =>
        Assert.Equal(expected, InboxEndpoints.SniffMime(bytes, declared));

    [Fact]
    public void The_key_survives_how_the_iphone_pastes_it()
    {
        var key = new string('a', 30) + "0123456789" + new string('f', 24);
        Assert.Equal(key, InboxEndpoints.ShortcutKey($"Bearer {key}", null));
        Assert.Equal(key, InboxEndpoints.ShortcutKey($"bearer  {key[..22]}-\n{key[22..41]}\u00AD-{key[41..]} ", null));
        Assert.Equal(key, InboxEndpoints.ShortcutKey(key.ToUpperInvariant(), null));
        Assert.Equal(key, InboxEndpoints.ShortcutKey(null, key));
        Assert.Null(InboxEndpoints.ShortcutKey("https://viajes-production-82cb.up.railway.app/api/inbox/share", null));
        Assert.Null(InboxEndpoints.ShortcutKey(null, null));
    }
}
