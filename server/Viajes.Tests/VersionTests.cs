using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;

namespace Viajes.Tests;

public sealed class DeployedApp : TestApp
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("RAILWAY_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
        builder.UseSetting("RAILWAY_DEPLOYMENT_ID", "53cc777c-d5eb-435d-aaf3-5ab96cc3c553");
    }
}

public sealed class VersionTests(DeployedApp app) : IClassFixture<DeployedApp>
{
    [Fact]
    public async Task Version_names_the_deployment_and_when_it_started()
    {
        var before = DateTimeOffset.UtcNow.AddMinutes(-1);

        var version = await app.CreateHttpsClient().GetFromJsonAsync<Version>("/api/version");

        Assert.Equal("0123456", version!.Commit);
        Assert.Equal("53cc777c-d5eb-435d-aaf3-5ab96cc3c553", version.DeploymentId);
        Assert.InRange(version.StartedAt, before, DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task Version_needs_no_session()
    {
        var response = await app.CreateHttpsClient(handleCookies: false).GetAsync("/api/version");

        response.EnsureSuccessStatusCode();
    }

    private sealed record Version(string? Commit, string? DeploymentId, DateTimeOffset StartedAt);
}

public sealed class UnidentifiedVersionTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Without_railway_variables_the_identifiers_are_null()
    {
        var version = await app.CreateHttpsClient().GetFromJsonAsync<Version>("/api/version");

        Assert.Null(version!.Commit);
        Assert.Null(version.DeploymentId);
    }

    private sealed record Version(string? Commit, string? DeploymentId, DateTimeOffset StartedAt);
}
