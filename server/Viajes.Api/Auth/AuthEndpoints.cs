using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace Viajes.Api.Auth;

public static class AuthEndpoints
{
    public sealed record RegisterRequest(string Email, string Password, string Code);

    public sealed record LoginRequest(string Email, string Password);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").RequireRateLimiting(AuthSetup.RateLimitPolicy);

        group.MapPost("/register", async (
            RegisterRequest body,
            IConfiguration config,
            UserManager<IdentityUser> users,
            SignInManager<IdentityUser> signIn) =>
        {
            // Hasta que existan las invitaciones (Plan 2), solo se registra quien conoce el código.
            if (!IsRegistrationCode(body.Code, config["REGISTRATION_CODE"]))
            {
                return Results.Problem("El código de registro no es válido.", statusCode: StatusCodes.Status403Forbidden);
            }

            var user = new IdentityUser { UserName = body.Email, Email = body.Email };
            var result = await users.CreateAsync(user, body.Password);
            if (!result.Succeeded)
            {
                return Results.Problem(IdentityMessages.Describe(result.Errors), statusCode: StatusCodes.Status400BadRequest);
            }

            await signIn.SignInAsync(user, isPersistent: true);
            return Results.Ok(new { email = user.Email });
        });

        group.MapPost("/login", async (LoginRequest body, SignInManager<IdentityUser> signIn) =>
        {
            var result = await signIn.PasswordSignInAsync(body.Email, body.Password, isPersistent: true, lockoutOnFailure: true);
            if (result.IsLockedOut)
            {
                return Results.Problem("Demasiados intentos. Espera unos minutos.", statusCode: StatusCodes.Status429TooManyRequests);
            }

            return result.Succeeded
                ? Results.Ok(new { email = body.Email })
                : Results.Problem("Email o contraseña incorrectos.", statusCode: StatusCodes.Status401Unauthorized);
        });

        group.MapPost("/logout", async (SignInManager<IdentityUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        });

        app.MapGet("/api/auth/me", (ClaimsPrincipal user) => Results.Ok(new { email = user.Identity!.Name }))
            .RequireAuthorization();
    }

    private static bool IsRegistrationCode(string? given, string? expected) =>
        !string.IsNullOrEmpty(expected)
        && given is not null
        && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected));
}
