using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Auth;

/// <summary>
/// Contraseña olvidada sin email: quien administra el hogar genera un enlace para un miembro y se lo manda (WhatsApp,
/// por ejemplo). El enlace sirve una vez —al cambiar la contraseña cambia el sello de seguridad y el token deja de valer—
/// y caduca a las 24 horas. Cambiarla cierra las sesiones que esa cuenta tuviera abiertas en otros dispositivos.
/// </summary>
public static class PasswordResetEndpoints
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);

    private const string Purpose = "ResetPassword";

    public sealed record ResetCheck(string UserId, string Token);

    public sealed record ResetRequest(string UserId, string Token, string Password);

    public static void MapPasswordResetEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/household/members/{userId}/password-reset", CreateLink).RequireAuthorization();

        // Quien abre el enlace no tiene sesión: anónimo, con límite de intentos.
        app.MapPost("/api/auth/password-reset/check", Check).RequireRateLimiting(AuthSetup.RateLimitPolicy);
        app.MapPost("/api/auth/password-reset", Reset).RequireRateLimiting(AuthSetup.RateLimitPolicy);
    }

    private static async Task<IResult> CreateLink(string userId, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var me = users.GetUserId(principal)!;
        var householdId = await access.EnsureHousehold(me);
        var mine = await db.HouseholdMembers.FirstAsync(m => m.HouseholdId == householdId && m.UserId == me && m.DeletedAtMs == null);
        if (mine.Role != HouseholdMember.Admin)
        {
            return Results.Problem("Solo quien administra el hogar puede generar enlaces para cambiar la contraseña.", statusCode: StatusCodes.Status403Forbidden);
        }

        if (userId == me)
        {
            return Results.Problem("Para tu propia cuenta usa «Cambiar contraseña» en Ajustes.", statusCode: StatusCodes.Status400BadRequest);
        }

        var isMember = await db.HouseholdMembers.AnyAsync(m => m.HouseholdId == householdId && m.UserId == userId && m.DeletedAtMs == null);
        var user = isMember ? await users.FindByIdAsync(userId) : null;
        if (user is null)
        {
            return Results.NotFound();
        }

        var token = await users.GeneratePasswordResetTokenAsync(user);
        return Results.Ok(new
        {
            userId = user.Id,
            email = user.Email,
            token = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token)),
            expiresMs = DateTimeOffset.UtcNow.Add(Lifetime).ToUnixTimeMilliseconds(),
        });
    }

    private static async Task<IResult> Check(ResetCheck body, UserManager<IdentityUser> users)
    {
        var (user, token) = await Resolve(body.UserId, body.Token, users);
        if (user is null || !await users.VerifyUserTokenAsync(user, users.Options.Tokens.PasswordResetTokenProvider, Purpose, token!))
        {
            return Invalid();
        }

        return Results.Ok(new { email = user.Email });
    }

    private static async Task<IResult> Reset(ResetRequest body, UserManager<IdentityUser> users, SignInManager<IdentityUser> signIn)
    {
        var (user, token) = await Resolve(body.UserId, body.Token, users);
        if (user is null)
        {
            return Invalid();
        }

        var result = await users.ResetPasswordAsync(user, token!, body.Password ?? "");
        if (!result.Succeeded)
        {
            return result.Errors.Any(e => e.Code == "InvalidToken")
                ? Invalid()
                : Results.Problem(IdentityMessages.Describe(result.Errors), statusCode: StatusCodes.Status400BadRequest);
        }

        // Si se bloqueó por intentos fallidos, con la contraseña nueva ya puede entrar.
        await users.ResetAccessFailedCountAsync(user);
        await users.SetLockoutEndDateAsync(user, null);
        await signIn.SignInAsync(user, isPersistent: true);
        return Results.Ok(new { email = user.Email });
    }

    private static async Task<(IdentityUser? User, string? Token)> Resolve(string? userId, string? encoded, UserManager<IdentityUser> users)
    {
        if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(encoded))
        {
            return (null, null);
        }

        string token;
        try
        {
            token = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(encoded));
        }
        catch (FormatException)
        {
            return (null, null);
        }

        return (await users.FindByIdAsync(userId), token);
    }

    private static IResult Invalid() =>
        Results.Problem("Este enlace no es válido, ha caducado o ya se ha usado. Pide otro a quien administra tu hogar.", statusCode: StatusCodes.Status410Gone);
}
