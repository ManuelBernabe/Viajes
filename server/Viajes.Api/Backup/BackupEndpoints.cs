using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Auth;
using Viajes.Api.Data;
using Viajes.Api.Inbox;

namespace Viajes.Api.Backup;

public static class BackupEndpoints
{
    public static IServiceCollection AddBackups(this IServiceCollection services, string dataDir)
    {
        services.AddSingleton(new BackupPaths(dataDir));
        services.AddSingleton<BackupService>();
        services.AddHostedService<DailyBackupService>();
        return services;
    }

    public static void MapBackupEndpoints(this IEndpointRouteBuilder app)
    {
        // La descarga completa la pide un script externo (Drive) con un token de copia; no hay sesión.
        app.MapGet("/api/backup", Download).RequireRateLimiting(AuthSetup.RateLimitPolicy);
        // Lo que ve Ajustes: las copias locales que hay en el volumen.
        app.MapGet("/api/backup/local", ListLocal).RequireAuthorization();
    }

    private static async Task<IResult> Download(HttpContext http, AppDbContext db, BackupService backups, ILoggerFactory loggers, CancellationToken ct)
    {
        var log = loggers.CreateLogger("Viajes.Backup");
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return Results.Problem("Falta el token de copia de seguridad.", statusCode: StatusCodes.Status401Unauthorized);
        }

        var hash = InboxEndpoints.Hash(header[7..].Trim());
        var token = await db.ImportTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null || token.RevokedMs is not null || token.Scope != ImportToken.BackupScope)
        {
            log.LogWarning("Copia de seguridad rechazada: token {Estado}.", token is null ? "desconocido" : token.RevokedMs is not null ? "revocado" : "sin permiso de copia");
            return Results.Problem("Token no válido para copias de seguridad.", statusCode: StatusCodes.Status401Unauthorized);
        }

        token.LastUsedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await db.SaveChangesAsync(ct);

        var name = $"viajes-{DateTime.UtcNow:yyyy-MM-dd-HHmm}.zip";
        http.Response.ContentType = "application/zip";
        http.Response.Headers.ContentDisposition = $"attachment; filename=\"{name}\"";
        await backups.WriteZipAsync(http.Response.Body, ct);
        log.LogInformation("Copia de seguridad descargada con el token «{Etiqueta}».", token.Label);
        return Results.Empty;
    }

    private static IResult ListLocal(ClaimsPrincipal principal, UserManager<IdentityUser> users, BackupService backups)
    {
        _ = users.GetUserId(principal);
        return Results.Ok(backups.ListLocal());
    }
}
