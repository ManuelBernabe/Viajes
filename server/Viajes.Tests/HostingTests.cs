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
