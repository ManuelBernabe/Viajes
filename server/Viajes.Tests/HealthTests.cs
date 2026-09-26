namespace Viajes.Tests;

public sealed class HealthTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Health_answers_ok()
    {
        var response = await app.CreateHttpsClient().GetAsync("/api/health");

        response.EnsureSuccessStatusCode();
        Assert.Contains("\"status\":\"ok\"", await response.Content.ReadAsStringAsync());
    }
}
