using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Viajes.Api.Access;
using Viajes.Api.Households;

namespace Viajes.Api.Auth;

public static class AuthEndpoints
{
    /// <summary>Alta con el código de registro o con el token de una invitación al hogar.</summary>
    public sealed record RegisterRequest(string Email, string Password, string? Code, string? Invitation);

    public sealed record LoginRequest(string Email, string Password);

    public sealed record PasswordRequest(string Current, string New);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").RequireRateLimiting(AuthSetup.RateLimitPolicy);

        group.MapPost("/register", async (
            RegisterRequest body,
            IConfiguration config,
            UserManager<IdentityUser> users,
            SignInManager<IdentityUser> signIn,
            AccessService access,
            InvitationService invitations) =>
        {
            // Se registra quien conoce el código o quien trae una invitación válida al hogar de alguien.
            var invited = !string.IsNullOrEmpty(body.Invitation);
            if (invited)
            {
                if ((await invitations.Lookup(body.Invitation!)).State != InvitationState.Valid)
                {
                    return Results.Problem("La invitación no es válida, ha caducado o ya se ha usado.", statusCode: StatusCodes.Status410Gone);
                }
            }
            else if (string.IsNullOrEmpty(config["REGISTRATION_CODE"]))
            {
                // Sin código configurado, solo se entra con el enlace de invitación de alguien del hogar.
                return Results.Problem("Para crear una cuenta hace falta un enlace de invitación.", statusCode: StatusCodes.Status403Forbidden);
            }
            else if (!IsRegistrationCode(body.Code, config["REGISTRATION_CODE"]))
            {
                return Results.Problem("El código de registro no es válido.", statusCode: StatusCodes.Status403Forbidden);
            }

            var user = new IdentityUser { UserName = body.Email, Email = body.Email };
            var result = await users.CreateAsync(user, body.Password);
            if (!result.Succeeded)
            {
                return Results.Problem(IdentityMessages.Describe(result.Errors), statusCode: StatusCodes.Status400BadRequest);
            }

            if (invited)
            {
                // La cuenta nace ya dentro del hogar que invita; si el token se gastó entre medias, tendrá el suyo propio.
                await invitations.Accept(body.Invitation!, user.Id);
            }

            await access.EnsureHousehold(user.Id);
            await signIn.SignInAsync(user, isPersistent: true);
            return Results.Ok(new { email = user.Email });
        });

        group.MapPost("/login", async (
            LoginRequest body,
            SignInManager<IdentityUser> signIn,
            UserManager<IdentityUser> users,
            AccessService access) =>
        {
            var result = await signIn.PasswordSignInAsync(body.Email, body.Password, isPersistent: true, lockoutOnFailure: true);
            if (result.IsLockedOut)
            {
                return Results.Problem("Demasiados intentos: la cuenta queda bloqueada 15 minutos. Si no recuerdas la contraseña, pulsa «¿Has olvidado la contraseña?» y te llegará un enlace por correo; con él entras sin esperar.", statusCode: StatusCodes.Status429TooManyRequests);
            }

            if (!result.Succeeded)
            {
                return Results.Problem("Email o contraseña incorrectos.", statusCode: StatusCodes.Status401Unauthorized);
            }

            // Las cuentas creadas antes del Plan 1 no tienen hogar todavía.
            var user = await users.FindByEmailAsync(body.Email);
            await access.EnsureHousehold(user!.Id);
            return Results.Ok(new { email = body.Email });
        });

        // Cambiar la contraseña cierra las demás sesiones (cambia el sello) y mantiene abierta esta.
        app.MapPost("/api/auth/password", async (PasswordRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, SignInManager<IdentityUser> signIn) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            var result = await users.ChangePasswordAsync(user, body.Current ?? "", body.New ?? "");
            if (!result.Succeeded)
            {
                return Results.Problem(IdentityMessages.Describe(result.Errors), statusCode: StatusCodes.Status400BadRequest);
            }

            await signIn.RefreshSignInAsync(user);
            return Results.NoContent();
        }).RequireAuthorization().RequireRateLimiting(AuthSetup.RateLimitPolicy);

        // Cierra todas las sesiones de la cuenta (móvil perdido): cambia el sello de seguridad y cierra también esta.
        app.MapPost("/api/auth/logout-everywhere", async (ClaimsPrincipal principal, UserManager<IdentityUser> users, SignInManager<IdentityUser> signIn) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            await users.UpdateSecurityStampAsync(user);
            await signIn.SignOutAsync();
            return Results.NoContent();
        }).RequireAuthorization();

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
