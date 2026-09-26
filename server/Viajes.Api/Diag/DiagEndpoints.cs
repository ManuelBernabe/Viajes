using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;
using Viajes.Api.Storage;

namespace Viajes.Api.Diag;

public static class DiagEndpoints
{
    public const long MaxFileBytes = 20_000_000;

    public sealed record MarkRequest(Guid Id, string Local);

    public static void MapDiagEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/diag").RequireAuthorization();

        group.MapPost("/marks", async (
            MarkRequest body,
            ClaimsPrincipal principal,
            UserManager<IdentityUser> users,
            AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(body.Local) || body.Local.Length > 100)
            {
                return Results.Problem("La marca debe tener entre 1 y 100 caracteres.", statusCode: StatusCodes.Status400BadRequest);
            }

            var userId = users.GetUserId(principal)!;
            var existing = await db.DiagMarks.FindAsync(body.Id);
            if (existing is not null)
            {
                return ResultForExisting(existing.UserId, userId);
            }

            db.DiagMarks.Add(new DiagMark
            {
                Id = body.Id,
                UserId = userId,
                Local = body.Local,
                CreatedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException e) when (e.InnerException is SqliteException { SqliteErrorCode: SqliteUniqueViolation })
            {
                // Otro reenvío de la misma operación la insertó entre la consulta y el guardado.
                db.ChangeTracker.Clear();
                var owner = await db.DiagMarks.Where(m => m.Id == body.Id).Select(m => m.UserId).SingleAsync();
                return ResultForExisting(owner, userId);
            }

            return Results.NoContent();
        });

        group.MapGet("/marks", async (ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db) =>
        {
            var userId = users.GetUserId(principal)!;
            var marks = await db.DiagMarks
                .Where(m => m.UserId == userId)
                .OrderBy(m => m.CreatedMs)
                .Select(m => new { m.Id, m.Local })
                .ToListAsync();
            return Results.Ok(marks);
        });

        group.MapPut("/file", async (
            HttpContext http,
            ClaimsPrincipal principal,
            UserManager<IdentityUser> users,
            IFileStore store,
            CancellationToken ct) =>
        {
            var length = http.Request.ContentLength;
            if (length is null)
            {
                return Results.Problem("Falta el tamaño del fichero.", statusCode: StatusCodes.Status411LengthRequired);
            }

            if (length > MaxFileBytes)
            {
                return Results.Problem("El fichero supera los 20 MB.", statusCode: StatusCodes.Status413PayloadTooLarge);
            }

            var contentType = http.Request.ContentType ?? "application/octet-stream";
            await store.WriteAsync(FileKey(users, principal), http.Request.Body, contentType, ct);
            return Results.NoContent();
        });

        group.MapGet("/file", async (
            HttpContext http,
            ClaimsPrincipal principal,
            UserManager<IdentityUser> users,
            IFileStore store,
            CancellationToken ct) =>
        {
            var file = await store.OpenReadAsync(FileKey(users, principal), ct);
            return file is null ? Results.NotFound() : FileResponses.Serve(http, file);
        });

        // Sin sesión y solo con los datos de quien pregunta: sirve para comprobar en Railway que la IP
        // real del cliente llega tras el proxy, que es la clave con la que se limitan los intentos.
        app.MapGet("/api/diag/network", (HttpContext http) => Results.Ok(new
        {
            scheme = http.Request.Scheme,
            remoteIp = http.Connection.RemoteIpAddress?.ToString(),
            forwardedFor = http.Request.Headers["X-Forwarded-For"].ToString(),
        }));
    }

    private const int SqliteUniqueViolation = 19;

    private static IResult ResultForExisting(string ownerId, string userId) =>
        ownerId == userId
            ? Results.NoContent()
            : Results.Problem("Ese identificador ya está en uso.", statusCode: StatusCodes.Status409Conflict);

    private static string FileKey(UserManager<IdentityUser> users, ClaimsPrincipal principal) =>
        $"diag/{users.GetUserId(principal)}/probe";
}
