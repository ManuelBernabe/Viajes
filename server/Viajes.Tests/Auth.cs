using System.Net.Http.Json;

namespace Viajes.Tests;

public static class Auth
{
    public const string Password = "Viajes2026ok";

    public static async Task RegisterAsync(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { email, password = Password, code = TestApp.RegistrationCode });
        response.EnsureSuccessStatusCode();
    }
}
