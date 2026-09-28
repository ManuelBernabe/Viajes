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

public sealed class InstantStampApp : TestApp
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("SECURITY_STAMP_SECONDS", "0");
    }
}

public sealed class SessionControlTests(InstantStampApp app) : IClassFixture<InstantStampApp>
{
    private async Task<HttpClient> SignIn(string email, string password = Auth.Password)
    {
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/login", new { email, password })).EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task Logging_out_everywhere_ends_every_session_of_the_account()
    {
        var phone = app.CreateHttpsClient();
        await Auth.RegisterAsync(phone, "todas-sesiones@example.com");
        var laptop = await SignIn("todas-sesiones@example.com");
        Assert.Equal(HttpStatusCode.OK, (await laptop.GetAsync("/api/auth/me")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await laptop.PostAsync("/api/auth/logout-everywhere", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await phone.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await (await SignIn("todas-sesiones@example.com")).GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Changing_the_password_keeps_this_session_and_ends_the_others()
    {
        var phone = app.CreateHttpsClient();
        await Auth.RegisterAsync(phone, "cambio-clave@example.com");
        var laptop = await SignIn("cambio-clave@example.com");

        var wrong = await phone.PostAsJsonAsync("/api/auth/password", new { current = "no-es-esta-12", @new = "NuevaClave2026" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        var ok = await phone.PostAsJsonAsync("/api/auth/password", new { current = Auth.Password, @new = "NuevaClave2026" });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await phone.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await (await SignIn("cambio-clave@example.com", "NuevaClave2026")).GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task The_console_command_sets_a_temporary_password_and_ends_sessions()
    {
        var phone = app.CreateHttpsClient();
        await Auth.RegisterAsync(phone, "consola@example.com");

        var output = new StringWriter();
        var code = await Viajes.Api.Auth.AdminCommands.RunAsync(app.Services, ["reset-password", "consola@example.com"], output);

        Assert.Equal(0, code);
        var temporary = System.Text.RegularExpressions.Regex.Match(output.ToString(), @"consola@example\.com: (\S{16})").Groups[1].Value;
        Assert.Equal(16, temporary.Length);
        Assert.Equal(HttpStatusCode.Unauthorized, (await phone.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await (await SignIn("consola@example.com", temporary)).GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(1, await Viajes.Api.Auth.AdminCommands.RunAsync(app.Services, ["reset-password", "nadie@example.com"], new StringWriter()));
    }
}
