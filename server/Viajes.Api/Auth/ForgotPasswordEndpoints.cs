using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;

namespace Viajes.Api.Auth;

/// <summary>
/// «¿Has olvidado la contraseña?» sin depender de nadie: la persona pide un enlace con su email y le llega por correo.
///
/// El servidor no envía correo (Railway bloquea el SMTP en el plan Hobby). Lo envía el script de Gmail del hogar, que
/// ya corre cada minuto: recoge aquí los correos pendientes con su token de importación y los manda con MailApp desde
/// la cuenta de quien administra. El servidor solo da la ruta del enlace; la dirección la pone el script con su
/// VIAJES_URL, así que una cabecera Host falsa no puede colar un enlace a otro sitio.
///
/// La cola vive en memoria: si el servidor se reinicia antes de que el script pase, se pide otra vez.
/// </summary>
public static class ForgotPasswordEndpoints
{
    public sealed record ForgotRequest(string? Email);

    public static IServiceCollection AddForgotPassword(this IServiceCollection services) =>
        services.AddSingleton(_ => new PasswordMailQueue());

    public static void MapForgotPasswordEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/forgot", Forgot).RequireRateLimiting(AuthSetup.RateLimitPolicy);
        // Lo llama el script de Gmail con su token; sin sesión.
        app.MapGet("/api/mail/pending", Pending);
    }

    /// <summary>Siempre responde lo mismo, exista o no la cuenta, para no revelar qué emails están dados de alta.</summary>
    private static async Task<IResult> Forgot(ForgotRequest body, UserManager<IdentityUser> users, AppDbContext db, PasswordMailQueue queue, ILoggerFactory loggers)
    {
        var log = loggers.CreateLogger("Viajes.Auth");
        var email = body.Email?.Trim();
        var user = string.IsNullOrEmpty(email) ? null : await users.FindByEmailAsync(email);
        if (user?.Email is null)
        {
            return Results.NoContent();
        }

        var householdId = await MailingHousehold(user.Id, db);
        if (householdId is null)
        {
            log.LogWarning("Contraseña olvidada: ningún hogar de la cuenta tiene el script de Gmail; no se puede enviar el correo.");
            return Results.NoContent();
        }

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var path = $"/restablecer/{Uri.EscapeDataString(user.Id)}/{WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token))}";
        queue.Enqueue(householdId.Value, user.Id, user.Email, path);
        return Results.NoContent();
    }

    /// <summary>
    /// El hogar cuyo script enviará el correo: el actual de la persona o, si no tiene script (por ejemplo, la sacaron del
    /// hogar y quedó en uno vacío), el último del que formó parte.
    /// </summary>
    private static async Task<Guid?> MailingHousehold(string userId, AppDbContext db)
    {
        var mine = await db.HouseholdMembers
            .Where(m => m.UserId == userId)
            .OrderBy(m => m.DeletedAtMs == null ? 0 : 1)
            .ThenByDescending(m => m.DeletedAtMs)
            .Select(m => m.HouseholdId)
            .ToListAsync();
        var tokenOwners = await db.ImportTokens
            .Where(t => t.Scope == ImportToken.ImportScope && t.RevokedMs == null)
            .Select(t => t.UserId)
            .ToListAsync();
        var withScript = await db.HouseholdMembers
            .Where(m => tokenOwners.Contains(m.UserId) && m.DeletedAtMs == null)
            .Select(m => m.HouseholdId)
            .ToListAsync();
        foreach (var householdId in mine.Distinct())
        {
            if (withScript.Contains(householdId))
            {
                return householdId;
            }
        }

        return null;
    }

    private static async Task<IResult> Pending(HttpContext http, AppDbContext db, PasswordMailQueue queue)
    {
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return Results.Problem("Falta el token.", statusCode: StatusCodes.Status401Unauthorized);
        }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(header[7..].Trim()))).ToLowerInvariant();
        var token = await db.ImportTokens.FirstOrDefaultAsync(t => t.TokenHash == hash);
        if (token is null || token.RevokedMs is not null || token.Scope != ImportToken.ImportScope)
        {
            return Results.Problem("Token no válido o revocado.", statusCode: StatusCodes.Status401Unauthorized);
        }

        var householdId = await db.HouseholdMembers
            .Where(m => m.UserId == token.UserId && m.DeletedAtMs == null)
            .Select(m => (Guid?)m.HouseholdId)
            .FirstOrDefaultAsync();
        if (householdId is null)
        {
            return Results.Ok(Array.Empty<object>());
        }

        var mails = queue.Take(householdId.Value).Select(e => new
        {
            to = e.To,
            subject = "Viajes: enlace para poner una contraseña nueva",
            path = e.Path,
        });
        return Results.Ok(mails);
    }
}

/// <summary>Correos de «contraseña olvidada» esperando a que el script de Gmail de su hogar los recoja.</summary>
public sealed class PasswordMailQueue(TimeProvider? clock = null)
{
    public sealed record Entry(Guid HouseholdId, string UserId, string To, string Path, long CreatedMs);

    /// <summary>Más de un correo por cuenta en este plazo no se encola: evita que alguien llene el buzón de otro.</summary>
    public static readonly TimeSpan MinInterval = TimeSpan.FromMinutes(2);

    /// <summary>Lo que el script no recoge en este plazo se descarta (el script pasa cada minuto).</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(30);

    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private readonly List<Entry> entries = [];
    private readonly Dictionary<string, long> lastByUser = [];
    private readonly Lock gate = new();

    public bool Enqueue(Guid householdId, string userId, string to, string path)
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        lock (gate)
        {
            Prune(now);
            if (lastByUser.TryGetValue(userId, out var last) && now - last < MinInterval.TotalMilliseconds)
            {
                return false;
            }

            lastByUser[userId] = now;
            // Solo vale el último enlace pedido: los anteriores sin enviar sobran.
            entries.RemoveAll(e => e.UserId == userId);
            entries.Add(new Entry(householdId, userId, to, path, now));
            return true;
        }
    }

    public List<Entry> Take(Guid householdId)
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        lock (gate)
        {
            Prune(now);
            var mine = entries.Where(e => e.HouseholdId == householdId).ToList();
            entries.RemoveAll(e => e.HouseholdId == householdId);
            return mine;
        }
    }

    private void Prune(long now)
    {
        entries.RemoveAll(e => now - e.CreatedMs > MaxAge.TotalMilliseconds);
        foreach (var user in lastByUser.Where(p => now - p.Value > MaxAge.TotalMilliseconds).Select(p => p.Key).ToList())
        {
            lastByUser.Remove(user);
        }
    }
}
