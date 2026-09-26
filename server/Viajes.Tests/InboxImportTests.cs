using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;

namespace Viajes.Tests;

public sealed class InboxImportTests(TestApp app) : IClassFixture<TestApp>
{
    private const string Authenticated = "Authentication-Results: mx.google.com;\r\n       dkim=pass header.i=@iberia.com;\r\n       spf=pass (google.com: domain of noreply@iberia.com designates 1.2.3.4 as permitted sender)\r\n";

    private static readonly string FlightJsonLd = """
        {
          "@context": "http://schema.org",
          "@type": "FlightReservation",
          "reservationNumber": "XK7P2Q",
          "reservationFor": {
            "@type": "Flight",
            "flightNumber": "3170",
            "airline": { "@type": "Airline", "name": "Iberia", "iataCode": "IB" },
            "departureAirport": { "@type": "Airport", "name": "Madrid Barajas", "iataCode": "MAD" },
            "departureTime": "2026-10-12T10:05:00+02:00",
            "arrivalAirport": { "@type": "Airport", "name": "London Heathrow", "iataCode": "LHR" },
            "arrivalTime": "2026-10-12T11:35:00+01:00"
          }
        }
        """;

    [Fact]
    public async Task A_flight_confirmation_with_json_ld_becomes_a_draft_with_its_pdf()
    {
        var (api, token) = await SignUpWithToken("inbox1@example.com");
        var pdf = "%PDF-1.4 tarjeta"u8.ToArray();
        var eml = Email("<vuelo-1@iberia.com>", "Tu reserva XK7P2Q", Authenticated, html: $"<html><body><p>Gracias</p><script type=\"application/ld+json\">{FlightJsonLd}</script></body></html>", attachments: [("tarjeta.pdf", "application/pdf", pdf)]);

        var response = await Import(app, token, eml);
        var sync = await api.GetSyncFull();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var item = Assert.Single(sync.Inbox);
        Assert.Equal(("noreply@iberia.com", "Tu reserva XK7P2Q", "pending"), (item.FromAddress, item.Subject, item.Status));
        Assert.Equal(("flight", "IB 3170 MAD → LHR", "2026-10-12T10:05", "2026-10-12T11:35", "XK7P2Q", "MAD", "LHR"),
            (item.SuggestedType, item.SuggestedTitle, item.SuggestedStartLocal, item.SuggestedEndLocal, item.SuggestedReference, item.SuggestedStartPlace, item.SuggestedEndPlace));
        Assert.Contains("Gracias", item.BodyText);
        Assert.DoesNotContain("<", item.BodyText);
        var attachment = Assert.Single(item.Attachments);
        Assert.Equal(("tarjeta.pdf", "application/pdf", (long)pdf.Length), (attachment.Name, attachment.Mime, attachment.Size));

        var content = await api.Client.GetAsync($"/api/inbox/{item.Id}/attachments/{attachment.Id}/content");
        Assert.Equal(pdf, await content.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task A_pkpass_gives_the_barcode_text_and_the_date()
    {
        var (api, token) = await SignUpWithToken("inbox2@example.com");
        var pass = PkPassZip("""
            {
              "description": "Tarjeta de embarque",
              "relevantDate": "2026-10-12T10:05+02:00",
              "barcodes": [{ "message": "M1GARCIA/MANUEL       EXK7P2Q MADLHRIB 3170 285Y012A0001 100", "format": "PKBarcodeFormatQR" }],
              "boardingPass": {
                "transitType": "PKTransitTypeAir",
                "primaryFields": [{ "key": "origin", "value": "MAD" }, { "key": "destination", "value": "LHR" }],
                "auxiliaryFields": [{ "key": "flight", "value": "IB3170" }, { "key": "pnr", "value": "XK7P2Q" }]
              }
            }
            """);
        var eml = Email("<pase-1@iberia.com>", "Tu tarjeta de embarque", Authenticated, text: "Buen viaje", attachments: [("pase.pkpass", "application/octet-stream", pass)]);

        await Import(app, token, eml);
        var item = Assert.Single((await api.GetSyncFull()).Inbox);

        Assert.Equal(("flight", "IB3170 MAD → LHR", "2026-10-12T10:05", "XK7P2Q"), (item.SuggestedType, item.SuggestedTitle, item.SuggestedStartLocal, item.SuggestedReference));
        var attachment = Assert.Single(item.Attachments);
        Assert.Equal("application/vnd.apple.pkpass", attachment.Mime);
        Assert.StartsWith("M1GARCIA/MANUEL", attachment.QrText);
    }

    [Fact]
    public async Task A_plain_email_still_makes_a_draft_with_the_subject()
    {
        var (api, token) = await SignUpWithToken("inbox3@example.com");
        var eml = Email("<plano-1@hotel.com>", "Confirmación Hotel Playa", Authenticated, text: "Habitación doble, 3 noches.");

        var response = await Import(app, token, eml);
        var item = Assert.Single((await api.GetSyncFull()).Inbox);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Confirmación Hotel Playa", item.SuggestedTitle);
        Assert.Null(item.SuggestedType);
        Assert.Empty(item.Attachments);
    }

    [Fact]
    public async Task The_same_email_twice_does_not_duplicate()
    {
        var (api, token) = await SignUpWithToken("inbox4@example.com");
        var eml = Email("<dup-1@x.com>", "Dos veces", Authenticated, text: "hola");

        var first = await (await Import(app, token, eml)).Content.ReadFromJsonAsync<ImportResult>();
        var second = await (await Import(app, token, eml)).Content.ReadFromJsonAsync<ImportResult>();

        Assert.False(first!.Duplicate);
        Assert.True(second!.Duplicate);
        Assert.Equal(first.Id, second.Id);
        Assert.Single((await api.GetSyncFull()).Inbox);
    }

    [Fact]
    public async Task An_email_gmail_did_not_authenticate_is_rejected()
    {
        var (_, token) = await SignUpWithToken("inbox5@example.com");
        var eml = Email("<falso-1@x.com>", "Falso", "Authentication-Results: mx.google.com; dkim=fail; spf=softfail\r\n", text: "hola");

        var response = await Import(app, token, eml);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task A_forward_from_the_token_owner_is_accepted_without_gmail_headers_and_loses_the_fwd_prefix()
    {
        var (api, token) = await SignUpWithToken("dueno@example.com");
        var eml = Email("<fwd-1@gmail.com>", "Fwd: RV: 🚄 Tu reserva en Trenes.com 15337485", "", text: "Reenviado", from: "dueno@example.com");

        var response = await Import(app, token, eml);
        var item = Assert.Single((await api.GetSyncFull()).Inbox);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("🚄 Tu reserva en Trenes.com 15337485", item.SuggestedTitle);
    }

    [Fact]
    public async Task A_forward_pretending_to_be_the_owner_but_failing_gmail_checks_is_rejected()
    {
        var (_, token) = await SignUpWithToken("dueno2@example.com");
        var eml = Email("<spoof-1@x.com>", "Falso", "Authentication-Results: mx.google.com; dkim=fail; spf=fail\r\n", text: "hola", from: "dueno2@example.com");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Import(app, token, eml)).StatusCode);
    }

    [Fact]
    public async Task Arc_authentication_results_count_too()
    {
        var (api, token) = await SignUpWithToken("arc@example.com");
        var eml = Email("<arc-1@x.com>", "ARC", "ARC-Authentication-Results: i=1; mx.google.com;\r\n       dkim=pass header.i=@renfe.com\r\n", text: "hola");

        Assert.Equal(HttpStatusCode.OK, (await Import(app, token, eml)).StatusCode);
        Assert.Single((await api.GetSyncFull()).Inbox);
    }

    [Fact]
    public async Task A_missing_or_revoked_token_is_unauthorized()
    {
        var (api, token) = await SignUpWithToken("inbox6@example.com");
        var eml = Email("<tok-1@x.com>", "Token", Authenticated, text: "hola");

        Assert.Equal(HttpStatusCode.Unauthorized, (await Import(app, "no-es-un-token", eml)).StatusCode);

        var tokens = await api.Client.GetFromJsonAsync<List<TokenRow>>("/api/import-tokens/");
        await api.Client.DeleteAsync($"/api/import-tokens/{tokens!.Single().Id}");
        Assert.Equal(HttpStatusCode.Unauthorized, (await Import(app, token, eml)).StatusCode);
        Assert.NotNull((await api.Client.GetFromJsonAsync<List<TokenRow>>("/api/import-tokens/"))!.Single().RevokedMs);
    }

    [Fact]
    public async Task Confirming_or_discarding_changes_the_status_and_reaches_the_next_sync()
    {
        var (api, token) = await SignUpWithToken("inbox7@example.com");
        await Import(app, token, Email("<st-1@x.com>", "Uno", Authenticated, text: "a"));
        await Import(app, token, Email("<st-2@x.com>", "Dos", Authenticated, text: "b"));
        var sync = await api.GetSyncFull();
        var (one, two) = (sync.Inbox.Single(i => i.Subject == "Uno"), sync.Inbox.Single(i => i.Subject == "Dos"));
        var bookingId = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NoContent, (await api.Client.PostAsJsonAsync($"/api/inbox/{one.Id}/status", new { status = "confirmed", bookingId })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await api.Client.PostAsJsonAsync($"/api/inbox/{two.Id}/status", new { status = "discarded" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.Client.PostAsJsonAsync($"/api/inbox/{two.Id}/status", new { status = "raro" })).StatusCode);

        var after = await api.GetSyncFull(sync.Version);
        Assert.Equal(("confirmed", bookingId), (after.Inbox.Single(i => i.Id == one.Id).Status, after.Inbox.Single(i => i.Id == one.Id).BookingId));
        Assert.Equal("discarded", after.Inbox.Single(i => i.Id == two.Id).Status);
    }

    [Fact]
    public async Task Another_household_cannot_see_my_inbox()
    {
        var (_, token) = await SignUpWithToken("ana-inbox@example.com");
        var bea = await TripsApi.SignUp(app, "bea-inbox@example.com");
        var result = await (await Import(app, token, Email("<priv-1@x.com>", "Privado", Authenticated, text: "a", attachments: [("f.pdf", "application/pdf", "%PDF"u8.ToArray())]))).Content.ReadFromJsonAsync<ImportResult>();

        Assert.Empty((await bea.GetSyncFull()).Inbox);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.Client.PostAsJsonAsync($"/api/inbox/{result!.Id}/status", new { status = "discarded" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.Client.GetAsync($"/api/inbox/{result.Id}/attachments/{Guid.NewGuid()}/content")).StatusCode);
    }

    // ---- Auxiliares ----

    private async Task<(TripsApi Api, string Token)> SignUpWithToken(string email)
    {
        var api = await TripsApi.SignUp(app, email);
        var created = await (await api.Client.PostAsJsonAsync("/api/import-tokens/", new { label = "Prueba" })).Content.ReadFromJsonAsync<CreatedToken>();
        return (api, created!.Token);
    }

    private static async Task<HttpResponseMessage> Import(TestApp app, string token, string eml)
    {
        var client = app.CreateHttpsClient(handleCookies: false);
        var content = new StringContent(eml, Encoding.UTF8);
        content.Headers.ContentType = new MediaTypeHeaderValue("message/rfc822");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.PostAsync("/api/inbox/import", content);
    }

    private static string Email(string messageId, string subject, string extraHeaders, string? text = null, string? html = null, (string Name, string Mime, byte[] Bytes)[]? attachments = null, string from = "noreply@iberia.com")
    {
        var builder = new StringBuilder();
        builder.Append(extraHeaders);
        builder.Append($"From: Remitente <{from}>\r\nTo: manuel+viajes@gmail.com\r\n");
        builder.Append($"Subject: {subject}\r\nDate: Mon, 21 Sep 2026 10:00:00 +0200\r\nMessage-ID: {messageId}\r\nMIME-Version: 1.0\r\n");
        builder.Append("Content-Type: multipart/mixed; boundary=\"frontera\"\r\n\r\n");
        if (text is not null)
        {
            builder.Append("--frontera\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n").Append(text).Append("\r\n");
        }

        if (html is not null)
        {
            builder.Append("--frontera\r\nContent-Type: text/html; charset=utf-8\r\n\r\n").Append(html).Append("\r\n");
        }

        foreach (var (name, mime, bytes) in attachments ?? [])
        {
            builder.Append($"--frontera\r\nContent-Type: {mime}; name=\"{name}\"\r\nContent-Disposition: attachment; filename=\"{name}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n");
            builder.Append(Convert.ToBase64String(bytes)).Append("\r\n");
        }

        builder.Append("--frontera--\r\n");
        return builder.ToString();
    }

    private static byte[] PkPassZip(string passJson)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            using var writer = new StreamWriter(archive.CreateEntry("pass.json").Open());
            writer.Write(passJson);
        }

        return stream.ToArray();
    }

    private sealed record ImportResult(Guid Id, bool Duplicate);

    private sealed record CreatedToken(Guid Id, string Label, string Token);

    private sealed record TokenRow(Guid Id, string Label, long CreatedMs, long? RevokedMs, long? LastUsedMs);
}
