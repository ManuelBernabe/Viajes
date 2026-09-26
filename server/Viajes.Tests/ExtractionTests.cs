using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Viajes.Api.Ai;

namespace Viajes.Tests;

/// <summary>Extractor de mentira: recuerda lo que recibe y devuelve una reserva fija (o nada).</summary>
public sealed class FakeExtractor : IBookingExtractor
{
    public List<ExtractionInput> Inputs { get; } = [];

    public Extraction? Result { get; set; } = new(
        "flight", "AR 1133 MAD → EZE", "DWYOLX", "2026-10-01T20:05", "Europe/Madrid", "MAD",
        "2026-10-02T04:10", "America/Argentina/Buenos_Aires", "EZE", null,
        "Pasajeros: Manuel Bernabe Escribano (23G), Francisco Jose Belso Alfonso (23H) · Terminal 1");

    public bool IsAvailable => true;

    public Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct)
    {
        Inputs.Add(input);
        return Task.FromResult(Result);
    }
}

public sealed class AiApp : TestApp
{
    public FakeExtractor Fake { get; } = new();

    protected override IBookingExtractor? Extractor => Fake;
}

public sealed class ExtractionTests(AiApp app) : IClassFixture<AiApp>
{
    [Fact]
    public async Task A_pdf_is_read_by_the_extractor_and_the_fields_come_back()
    {
        var api = await TripsApi.SignUp(app, "ia1@example.com");
        var pdf = "%PDF-1.4 billete"u8.ToArray();

        var response = await Post(api, pdf, "application/pdf", "billete.pdf");
        var extraction = await response.Content.ReadFromJsonAsync<Extraction>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(("flight", "DWYOLX", "2026-10-01T20:05", "America/Argentina/Buenos_Aires"), (extraction!.Type, extraction.Reference, extraction.StartLocal, extraction.EndTz));
        Assert.Contains("23G", extraction.Notes);
        var input = app.Fake.Inputs.Last();
        Assert.Null(input.Text);
        var file = input.Files.Single();
        Assert.Equal(("billete.pdf", "application/pdf"), (file.Name, file.Mime));
        Assert.Equal(pdf, file.Bytes);
    }

    [Fact]
    public async Task Plain_text_goes_as_text()
    {
        var api = await TripsApi.SignUp(app, "ia2@example.com");

        await Post(api, Encoding.UTF8.GetBytes("Código de reserva DWYOLX"), "text/plain", null);

        var input = app.Fake.Inputs.Last();
        Assert.Equal("Código de reserva DWYOLX", input.Text);
        Assert.Empty(input.Files);
    }

    [Fact]
    public async Task Nothing_recognised_is_422_and_too_big_is_413()
    {
        var api = await TripsApi.SignUp(app, "ia3@example.com");
        app.Fake.Result = null;
        try
        {
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post(api, "%PDF"u8.ToArray(), "application/pdf", "x.pdf")).StatusCode);
        }
        finally
        {
            app.Fake.Result = new FakeExtractor().Result;
        }

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await Post(api, new byte[20_000_001], "application/pdf", "grande.pdf")).StatusCode);
    }

    [Fact]
    public async Task Extraction_needs_a_session()
    {
        var client = app.CreateHttpsClient(handleCookies: false);
        var content = new ByteArrayContent("%PDF"u8.ToArray());
        content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/extract", content)).StatusCode);
    }

    [Fact]
    public async Task An_imported_email_is_read_by_the_extractor_with_its_text_and_pdf()
    {
        var api = await TripsApi.SignUp(app, "ia4@example.com");
        var created = await (await api.Client.PostAsJsonAsync("/api/import-tokens/", new { label = "x" })).Content.ReadFromJsonAsync<Created>();
        var eml = "Authentication-Results: mx.google.com; dkim=pass\r\nFrom: a <avisos@aerolineas.com.ar>\r\nTo: manuel+viajes@gmail.com\r\nSubject: Confirmación de compra\r\nDate: Mon, 21 Sep 2026 10:00:00 +0200\r\nMessage-ID: <ia-1@x>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"f\"\r\n\r\n--f\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nCódigo de Reserva DWYOLX\r\n--f\r\nContent-Type: application/pdf; name=\"itinerario.pdf\"\r\nContent-Disposition: attachment; filename=\"itinerario.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" + Convert.ToBase64String("%PDF-1.4"u8.ToArray()) + "\r\n--f--\r\n";
        var client = app.CreateHttpsClient(handleCookies: false);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", created!.Token);
        var body = new StringContent(eml, Encoding.UTF8);
        body.Headers.ContentType = new MediaTypeHeaderValue("message/rfc822");

        var response = await client.PostAsync("/api/inbox/import", body);
        var item = Assert.Single((await api.GetSyncFull()).Inbox);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var input = app.Fake.Inputs.Last();
        Assert.Contains("DWYOLX", input.Text);
        Assert.Equal("itinerario.pdf", input.Files.Single().Name);
        Assert.Equal(("flight", "AR 1133 MAD → EZE", "DWYOLX", "2026-10-01T20:05", "EZE"), (item.SuggestedType, item.SuggestedTitle, item.SuggestedReference, item.SuggestedStartLocal, item.SuggestedEndPlace));
        Assert.Contains("23G", item.SuggestedNotes);
    }

    private static Task<HttpResponseMessage> Post(TripsApi api, byte[] bytes, string mime, string? name)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(mime);
        return api.Client.PostAsync(name is null ? "/api/extract" : $"/api/extract?name={Uri.EscapeDataString(name)}", content);
    }

    private sealed record Created(Guid Id, string Label, string Token);
}

public sealed class NoExtractorTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Without_an_api_key_the_endpoint_says_so()
    {
        var api = await TripsApi.SignUp(app, "sin-ia@example.com");
        var content = new ByteArrayContent("%PDF"u8.ToArray());
        content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");

        var response = await api.Client.PostAsync("/api/extract", content);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }
}
