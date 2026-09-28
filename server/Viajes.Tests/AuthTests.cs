using System.Net;
using System.Net.Http.Json;

namespace Viajes.Tests;

public sealed class AuthTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Register_requires_the_registration_code()
    {
        var response = await app.CreateHttpsClient().PostAsJsonAsync(
            "/api/auth/register",
            new { email = "sin-codigo@example.com", password = Auth.Password, code = "otro" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("código de registro", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Registered_user_is_signed_in()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "ana@example.com");

        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me");

        Assert.Equal("ana@example.com", me!.Email);
    }

    [Fact]
    public async Task Session_cookie_is_httponly_secure_strict_and_persistent()
    {
        var client = app.CreateHttpsClient(handleCookies: false);

        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { email = "cookie@example.com", password = Auth.Password, code = TestApp.RegistrationCode });

        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith("viajes_session="))
            .ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("expires=", cookie);
    }

    [Fact]
    public async Task Wrong_password_is_401_with_a_spanish_message()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "luis@example.com");

        var response = await app.CreateHttpsClient().PostAsJsonAsync(
            "/api/auth/login", new { email = "luis@example.com", password = "incorrecta-123" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Email o contraseña incorrectos.", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Five_wrong_passwords_lock_the_account()
    {
        await Auth.RegisterAsync(app.CreateHttpsClient(), "bloqueo@example.com");
        var client = app.CreateHttpsClient();
        for (var i = 0; i < 5; i++)
        {
            await client.PostAsJsonAsync("/api/auth/login", new { email = "bloqueo@example.com", password = "incorrecta-123" });
        }

        var response = await client.PostAsJsonAsync(
            "/api/auth/login", new { email = "bloqueo@example.com", password = Auth.Password });

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }

    [Fact]
    public async Task Me_without_session_is_401_not_a_redirect()
    {
        var response = await app.CreateHttpsClient().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Writes_from_another_origin_are_rejected()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "x@example.com", password = "x" }),
        };
        request.Headers.Add("Origin", "https://otro.example");

        var response = await app.CreateHttpsClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        // El cliente distingue este rechazo del de permisos para no descartar su cola de cambios.
        Assert.Contains("origin_rejected", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Data_protection_keys_live_in_the_data_dir()
    {
        await Auth.RegisterAsync(app.CreateHttpsClient(), "claves@example.com");

        Assert.NotEmpty(Directory.GetFiles(Path.Combine(app.DataDir, "keys"), "*.xml"));
    }

    private sealed record MeResponse(string Email);
}

public sealed class StrictRateLimitApp : TestApp
{
    public StrictRateLimitApp() => AuthRateLimit = 3;
}

public sealed class RateLimitTests(StrictRateLimitApp app) : IClassFixture<StrictRateLimitApp>
{
    [Fact]
    public async Task Too_many_auth_requests_are_429()
    {
        var client = app.CreateHttpsClient();
        for (var i = 0; i < 3; i++)
        {
            await client.PostAsJsonAsync("/api/auth/login", new { email = "x@example.com", password = "x" });
        }

        var response = await client.PostAsJsonAsync("/api/auth/login", new { email = "x@example.com", password = "x" });

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }
}

public sealed class InvitationOnlyApp : TestApp
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("REGISTRATION_CODE", "");
    }
}

public sealed class InvitationOnlyRegistrationTests(InvitationOnlyApp app) : IClassFixture<InvitationOnlyApp>
{
    [Fact]
    public async Task Without_a_registration_code_only_invited_people_can_sign_up()
    {
        var client = app.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = "sin-codigo@example.com", password = Auth.Password, code = "" });
        Assert.Equal(System.Net.HttpStatusCode.Forbidden, response.StatusCode);
        var guess = await client.PostAsJsonAsync("/api/auth/register", new { email = "sin-codigo2@example.com", password = Auth.Password, code = "cualquiera" });
        Assert.Equal(System.Net.HttpStatusCode.Forbidden, guess.StatusCode);
    }
}
