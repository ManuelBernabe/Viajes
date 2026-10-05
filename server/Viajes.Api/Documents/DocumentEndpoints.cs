using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;
using Viajes.Api.Storage;
using Viajes.Api.Trips;

namespace Viajes.Api.Documents;

/// <summary>
/// Documentos de viaje (pasaportes, visados, seguros…). Como el resto: el móvil guarda primero y la cola los manda aquí;
/// llegan a los demás por la sincronización. Sus fotos o PDF son adjuntos normales que apuntan al documento.
/// </summary>
public static class DocumentEndpoints
{
    public static void MapDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var documents = app.MapGroup("/api/documents").RequireAuthorization();
        documents.MapPut("/{id:guid}", Put);
        documents.MapDelete("/{id:guid}", Delete);
    }

    private static async Task<IResult> Put(
        Guid id, DocumentBody body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var person = Clean(body.Person, 100);
        if (person is null)
        {
            return Problem("Di de quién es el documento.", StatusCodes.Status400BadRequest);
        }

        var kind = body.Kind ?? "passport";
        if (!TravelDocument.Kinds.Contains(kind))
        {
            return Problem("Tipo de documento desconocido.", StatusCodes.Status400BadRequest);
        }

        var visibility = body.Visibility ?? Booking.VisibleToHousehold;
        if (!TravelDocument.Visibilities.Contains(visibility))
        {
            return Problem("Visibilidad no válida.", StatusCodes.Status400BadRequest);
        }

        var issued = Clean(body.IssuedDate, 10);
        var expiry = Clean(body.ExpiryDate, 10);
        if (!IsDate(issued) || !IsDate(expiry))
        {
            return Problem("Las fechas del documento no son válidas.", StatusCodes.Status400BadRequest);
        }

        var document = await db.TravelDocuments.FindAsync(id);
        if (document is null)
        {
            document = new TravelDocument
            {
                Id = id,
                HouseholdId = await access.EnsureHousehold(userId),
                Person = person,
                Kind = kind,
                CreatedBy = userId,
            };
            db.TravelDocuments.Add(document);
        }
        else
        {
            // Solo se edita un documento que se ve; uno privado de otra persona es como si no existiera.
            if (!await access.VisibleDocuments(userId).AnyAsync(d => d.Id == id))
            {
                return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
            }

            if (document.DeletedAtMs is not null)
            {
                return Results.Problem("El documento se ha borrado.", statusCode: StatusCodes.Status409Conflict);
            }

            // Solo quien lo apuntó puede hacerlo privado o volver a compartirlo.
            if (document.CreatedBy != userId)
            {
                visibility = document.Visibility;
            }
        }

        document.Person = person;
        document.Kind = kind;
        document.Number = Clean(body.Number, 100);
        document.Country = Clean(body.Country, 100);
        document.IssuedDate = issued;
        document.ExpiryDate = expiry;
        document.Notes = Clean(body.Notes, 2000);
        document.Visibility = visibility;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Delete(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var document = await access.VisibleDocuments(userId).FirstOrDefaultAsync(d => d.Id == id, ct);
        if (document is null)
        {
            return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var attachments = await db.Attachments.Where(a => a.BookingId == id && a.DeletedAtMs == null).ToListAsync(ct);
        foreach (var attachment in attachments)
        {
            attachment.DeletedAtMs = now;
        }

        document.DeletedAtMs ??= now;
        await db.SaveChangesAsync(ct);
        foreach (var attachment in attachments.Where(a => a.Uploaded))
        {
            try
            {
                await store.DeleteAsync(attachment.FileKey, ct);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // La fila ya está borrada; un fichero huérfano no bloquea a nadie.
            }
        }

        return Results.NoContent();
    }

    private static bool IsDate(string? value) =>
        value is null || DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static string? Clean(string? value, int max)
    {
        var text = value?.Trim();
        return string.IsNullOrEmpty(text) ? null : text[..Math.Min(text.Length, max)];
    }

    private static IResult Problem(string detail, int status) => Results.Problem(detail, statusCode: status);
}
