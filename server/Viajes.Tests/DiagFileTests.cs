using System.Net;
using System.Net.Http.Headers;

namespace Viajes.Tests;

public sealed class DiagFileTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task An_uploaded_file_comes_back_identical()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "fichero@example.com");
        var bytes = new byte[1_000_000];
        Random.Shared.NextBytes(bytes);

        var upload = await client.PutAsync("/api/diag/file", Pdf(bytes));
        var download = await client.GetAsync("/api/diag/file");

        Assert.Equal(HttpStatusCode.NoContent, upload.StatusCode);
        Assert.Equal("application/pdf", download.Content.Headers.ContentType?.MediaType);
        Assert.Equal(bytes, await download.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Files_over_20_mb_are_rejected()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "grande@example.com");

        var response = await client.PutAsync("/api/diag/file", Pdf(new byte[20_000_001]));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task Another_user_cannot_read_my_file()
    {
        var ana = app.CreateHttpsClient();
        await Auth.RegisterAsync(ana, "ana-fichero@example.com");
        await ana.PutAsync("/api/diag/file", Pdf([1, 2, 3]));
        var luis = app.CreateHttpsClient();
        await Auth.RegisterAsync(luis, "luis-fichero@example.com");

        var response = await luis.GetAsync("/api/diag/file");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Html_is_never_served_as_html_from_the_app_origin()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "html@example.com");
        var html = new ByteArrayContent("<script>fetch('/api/auth/me')</script>"u8.ToArray());
        html.Headers.ContentType = new MediaTypeHeaderValue("text/html");

        await client.PutAsync("/api/diag/file", html);
        var download = await client.GetAsync("/api/diag/file");

        Assert.Equal("application/octet-stream", download.Content.Headers.ContentType?.MediaType);
        Assert.Equal("nosniff", Assert.Single(download.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("sandbox", Assert.Single(download.Headers.GetValues("Content-Security-Policy")));
    }

    private static ByteArrayContent Pdf(byte[] bytes)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        return content;
    }
}
