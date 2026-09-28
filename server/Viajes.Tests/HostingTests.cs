using System.Net;

namespace Viajes.Tests;

public sealed class HostingTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Any_app_route_serves_the_spa()
    {
        var response = await app.CreateHttpsClient().GetAsync("/viaje/123");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<title>Viajes</title>", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unknown_api_route_is_404_not_the_spa()
    {
        var response = await app.CreateHttpsClient().GetAsync("/api/no-existe");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("<title>", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Uses_the_data_dir_from_configuration()
    {
        await app.CreateHttpsClient().GetAsync("/api/health");

        Assert.True(Directory.Exists(app.DataDir));
    }
}

public sealed class SecurityHeaderTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Every_response_carries_the_security_headers()
    {
        var client = app.CreateHttpsClient();
        foreach (var path in new[] { "/", "/api/health", "/api/version" })
        {
            var response = await client.GetAsync(path);
            Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
            Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
            Assert.Contains("default-src 'self'", response.Headers.GetValues("Content-Security-Policy").Single());
            Assert.Contains("frame-ancestors 'none'", response.Headers.GetValues("Content-Security-Policy").Single());
            Assert.Contains("max-age=31536000", response.Headers.GetValues("Strict-Transport-Security").Single());
        }
    }
}
