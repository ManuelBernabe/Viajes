using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Ai;
using Viajes.Api.Data;
using Viajes.Api.Storage;
using Viajes.Api.Trips;

namespace Viajes.Api.Inbox;

public static class InboxEndpoints
{
    public const long MaxMessageBytes = 25_000_000;

    public sealed record TokenRequest(string? Label);

    public sealed record StatusRequest(string Status, Guid? BookingId);

    public static void MapInboxEndpoints(this IEndpointRouteBuilder app)
    {
        var tokens = app.MapGroup("/api/import-tokens").RequireAuthorization();
        tokens.MapGet("/", ListTokens);
        tokens.MapPost("/", CreateToken);
        tokens.MapDelete("/{id:guid}", RevokeToken);

        // Lo llama el script de Gmail con el token; sin sesión.
        app.MapPost("/api/inbox/import", Import).DisableAntiforgery();

        var inbox = app.MapGroup("/api/inbox").RequireAuthorization();
        inbox.MapPost("/{id:guid}/status", SetStatus);
        inbox.MapPost("/{id:guid}/extract", ReExtract);
        inbox.MapGet("/{id:guid}/attachments/{attachmentId:guid}/content", AttachmentContent);
    }

    // ---- Tokens ----

    private static async Task<IResult> ListTokens(ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var list = await db.ImportTokens
            .Where(t => t.UserId == userId)
            .OrderByDescending(t => t.CreatedMs)
            .Select(t => new { t.Id, t.Label, t.CreatedMs, t.RevokedMs, t.LastUsedMs })
            .ToListAsync();
        return Results.Ok(list);
    }

    private static async Task<IResult> CreateToken(TokenRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var secret = RandomNumberGenerator.GetBytes(32);
        var token = Convert.ToHexString(secret).ToLowerInvariant();
        var entity = new ImportToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = Hash(token),
            Label = string.IsNullOrWhiteSpace(body.Label) ? "Gmail" : body.Label.Trim()[..Math.Min(100, body.Label.Trim().Length)],
            CreatedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };
        db.ImportTokens.Add(entity);
        await db.SaveChangesAsync();
        // El token solo se enseña ahora: en la base queda su hash.
        return Results.Ok(new { id = entity.Id, label = entity.Label, token });
    }

    private static async Task<IResult> RevokeToken(Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var token = await db.ImportTokens.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (token is null)
        {
            return Results.Problem("No existe.", statusCode: StatusCodes.Status404NotFound);
        }

        token.RevokedMs ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ---- Importación ----

    private static async Task<IResult> Import(
        HttpContext http, IConfiguration config, AppDbContext db, AccessService access, IFileStore store, IBookingExtractor extractor, ILoggerFactory loggers, CancellationToken ct)
    {
        var log = loggers.CreateLogger("Viajes.Inbox");
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            log.LogWarning("Importación rechazada: sin token.");
            return Results.Problem("Falta el token de importación.", statusCode: StatusCodes.Status401Unauthorized);
        }

        var hash = Hash(header[7..].Trim());
        var token = await db.ImportTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null || token.RevokedMs is not null)
        {
            log.LogWarning("Importación rechazada: token {Estado}.", token is null ? "desconocido" : "revocado");
            return Results.Problem("Token no válido o revocado.", statusCode: StatusCodes.Status401Unauthorized);
        }

        if (http.Request.ContentLength is null)
        {
            log.LogWarning("Importación rechazada: sin Content-Length.");
            return Results.Problem("Falta el tamaño del mensaje.", statusCode: StatusCodes.Status411LengthRequired);
        }

        if (http.Request.ContentLength > MaxMessageBytes)
        {
            log.LogWarning("Importación rechazada: {Bytes} bytes, más de 25 MB.", http.Request.ContentLength);
            return Results.Problem("El correo supera los 25 MB.", statusCode: StatusCodes.Status413PayloadTooLarge);
        }

        using var raw = new MemoryStream();
        await http.Request.Body.CopyToAsync(raw, ct);
        raw.Position = 0;

        ParsedEmail email;
        try
        {
            email = EmailParser.Parse(raw);
        }
        catch (Exception e) when (e is FormatException or MimeKit.ParseException)
        {
            log.LogWarning(e, "Importación rechazada: el correo no se puede leer ({Bytes} bytes).", raw.Length);
            return Results.Problem("No se puede leer el correo.", statusCode: StatusCodes.Status400BadRequest);
        }

        // Entra lo que Gmail validó (DKIM o SPF) y lo que la propia persona reenvía desde su cuenta: un correo de la
        // cuenta a sí misma no lleva cabecera de validación, pero solo puede haberlo escrito quien tiene la sesión de Gmail.
        var requireAuth = !string.Equals(config["IMPORT_REQUIRE_GMAIL_AUTH"], "false", StringComparison.OrdinalIgnoreCase);
        if (requireAuth && email.GmailAuth != GmailAuth.Pass)
        {
            var owner = await db.Users.FindAsync([token.UserId], ct);
            var ownForward = email.GmailAuth == GmailAuth.None
                && owner?.Email is not null
                && string.Equals(owner.Email, email.From, StringComparison.OrdinalIgnoreCase);
            if (!ownForward)
            {
                log.LogWarning("Importación rechazada: validación de Gmail {Resultado}, remitente {De}. Asunto «{Asunto}».", email.GmailAuth, email.From, email.Subject);
                return Results.Problem("Gmail no validó el remitente (DKIM/SPF).", statusCode: StatusCodes.Status422UnprocessableEntity);
            }
        }

        var householdId = await access.EnsureHousehold(token.UserId);
        var existing = await db.InboxItems.FirstOrDefaultAsync(i => i.HouseholdId == householdId && i.MessageId == email.MessageId, ct);
        if (existing is not null)
        {
            log.LogInformation("Importación repetida de «{Asunto}»: ya existía.", email.Subject);
            return Results.Ok(new { id = existing.Id, duplicate = true });
        }

        log.LogInformation("Importando «{Asunto}» de {De} con {Adjuntos} adjuntos (tipo propuesto: {Tipo}).", email.Subject, email.From, email.Attachments.Count, email.Suggestion.Type ?? "ninguno");

        // La IA lee el texto y los adjuntos y va primero; lo que deje vacío lo completan los datos estructurados y el asunto.
        if (extractor.IsAvailable)
        {
            var files = email.Attachments
                .Where(a => a.Mime == "application/pdf" || a.Mime.StartsWith("image/"))
                .Select(a => new ExtractionFile(a.Name, a.Mime, a.Bytes))
                .ToList();
            var extraction = await extractor.ExtractAsync(new ExtractionInput(email.BodyText, files), ct);
            if (extraction is not null)
            {
                var ai = new Suggestion
                {
                    Type = extraction.Type, Title = extraction.Title, Reference = extraction.Reference, StartLocal = extraction.StartLocal,
                    StartTz = extraction.StartTz, StartPlace = extraction.StartPlace, EndLocal = extraction.EndLocal, EndTz = extraction.EndTz,
                    EndPlace = extraction.EndPlace, Address = extraction.Address, Notes = extraction.Notes,
                };
                ai.FillFrom(email.Suggestion);
                email.Suggestion = ai;
            }
        }

        var itemId = Guid.NewGuid();
        var rawKey = $"households/{householdId}/inbox/{itemId}/raw";
        raw.Position = 0;
        await store.WriteAsync(rawKey, raw, "message/rfc822", ct);

        var item = new InboxItem
        {
            Id = itemId,
            HouseholdId = householdId,
            ImportedBy = token.UserId,
            MessageId = email.MessageId,
            FromAddress = email.From,
            Subject = email.Subject,
            ReceivedMs = email.ReceivedMs,
            SuggestedType = email.Suggestion.Type,
            SuggestedTitle = email.Suggestion.Title,
            SuggestedStartLocal = email.Suggestion.StartLocal,
            SuggestedStartTz = email.Suggestion.StartTz,
            SuggestedStartPlace = email.Suggestion.StartPlace,
            SuggestedEndLocal = email.Suggestion.EndLocal,
            SuggestedEndTz = email.Suggestion.EndTz,
            SuggestedEndPlace = email.Suggestion.EndPlace,
            SuggestedReference = email.Suggestion.Reference,
            SuggestedAddress = email.Suggestion.Address,
            SuggestedNotes = email.Suggestion.Notes,
            BodyText = email.BodyText,
            RawFileKey = rawKey,
            Status = InboxItem.Pending,
        };
        db.InboxItems.Add(item);

        foreach (var attachment in email.Attachments)
        {
            var attachmentId = Guid.NewGuid();
            var key = $"households/{householdId}/inbox/{itemId}/{attachmentId}";
            await store.WriteAsync(key, new MemoryStream(attachment.Bytes), attachment.Mime, ct);
            db.InboxAttachments.Add(new InboxAttachment
            {
                Id = attachmentId,
                InboxItemId = itemId,
                FileKey = key,
                Name = attachment.Name,
                Mime = attachment.Mime,
                Size = attachment.Bytes.Length,
                QrText = attachment.QrText,
            });
        }

        token.LastUsedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // El mismo correo llegó dos veces a la vez: gana el primero.
            var winner = await db.InboxItems.AsNoTracking().FirstAsync(i => i.HouseholdId == householdId && i.MessageId == email.MessageId, ct);
            return Results.Ok(new { id = winner.Id, duplicate = true });
        }

        return Results.Ok(new { id = itemId, duplicate = false, attachments = email.Attachments.Count });
    }

    // ---- Bandeja ----

    private static async Task<IResult> SetStatus(
        Guid id, StatusRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        if (body.Status is not (InboxItem.Confirmed or InboxItem.Discarded))
        {
            return Results.Problem("Estado desconocido.", statusCode: StatusCodes.Status400BadRequest);
        }

        var userId = users.GetUserId(principal)!;
        var item = await access.VisibleInboxItems(userId).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null)
        {
            return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
        }

        item.Status = body.Status;
        item.BookingId = body.Status == InboxItem.Confirmed ? body.BookingId : null;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// <summary>Vuelve a leer un borrador con la IA (para los importados antes de configurarla o si falló entonces).</summary>
    private static async Task<IResult> ReExtract(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store, IBookingExtractor extractor, CancellationToken ct)
    {
        if (!extractor.IsAvailable)
        {
            return Results.Problem("La lectura con IA no está configurada en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var userId = users.GetUserId(principal)!;
        var item = await access.VisibleInboxItems(userId).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null)
        {
            return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
        }

        var attachments = await db.InboxAttachments.Where(a => a.InboxItemId == id).ToListAsync(ct);
        var files = new List<ExtractionFile>();
        foreach (var attachment in attachments.Where(a => a.Mime == "application/pdf" || a.Mime.StartsWith("image/")))
        {
            var file = await store.OpenReadAsync(attachment.FileKey, ct);
            if (file is null)
            {
                continue;
            }

            using var buffer = new MemoryStream();
            await file.Content.CopyToAsync(buffer, ct);
            files.Add(new ExtractionFile(attachment.Name, attachment.Mime, buffer.ToArray()));
        }

        var extraction = await extractor.ExtractAsync(new ExtractionInput(item.BodyText, files), ct);
        if (extraction is null)
        {
            return Results.Problem("No se ha encontrado ninguna reserva en el correo.", statusCode: StatusCodes.Status422UnprocessableEntity);
        }

        item.SuggestedType = extraction.Type ?? item.SuggestedType;
        item.SuggestedTitle = extraction.Title ?? item.SuggestedTitle;
        item.SuggestedReference = extraction.Reference ?? item.SuggestedReference;
        item.SuggestedStartLocal = extraction.StartLocal ?? item.SuggestedStartLocal;
        item.SuggestedStartTz = extraction.StartTz ?? item.SuggestedStartTz;
        item.SuggestedStartPlace = extraction.StartPlace ?? item.SuggestedStartPlace;
        item.SuggestedEndLocal = extraction.EndLocal ?? item.SuggestedEndLocal;
        item.SuggestedEndTz = extraction.EndTz ?? item.SuggestedEndTz;
        item.SuggestedEndPlace = extraction.EndPlace ?? item.SuggestedEndPlace;
        item.SuggestedAddress = extraction.Address ?? item.SuggestedAddress;
        item.SuggestedNotes = extraction.Notes ?? item.SuggestedNotes;
        await db.SaveChangesAsync(ct);
        return Results.Ok(ToDto(item, attachments));
    }

    private static async Task<IResult> AttachmentContent(
        Guid id, Guid attachmentId, HttpContext http, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var item = await access.VisibleInboxItems(userId).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null)
        {
            return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
        }

        var attachment = await db.InboxAttachments.FirstOrDefaultAsync(a => a.Id == attachmentId && a.InboxItemId == id, ct);
        if (attachment is null)
        {
            return Results.Problem("No existe.", statusCode: StatusCodes.Status404NotFound);
        }

        var file = await store.OpenReadAsync(attachment.FileKey, ct);
        return file is null ? Results.NotFound() : FileResponses.Serve(http, file);
    }

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public static InboxItemDto ToDto(InboxItem item, IEnumerable<InboxAttachment> attachments) => new(
        item.Id, item.FromAddress, item.Subject, item.ReceivedMs, item.SuggestedType, item.SuggestedTitle,
        item.SuggestedStartLocal, item.SuggestedStartTz, item.SuggestedStartPlace, item.SuggestedEndLocal, item.SuggestedEndTz,
        item.SuggestedEndPlace, item.SuggestedReference, item.SuggestedAddress, item.SuggestedNotes, item.BodyText, item.Status, item.BookingId,
        attachments.Select(a => new InboxAttachmentDto(a.Id, a.Name, a.Mime, a.Size, a.QrText)).ToList(),
        item.Version, item.DeletedAtMs);
}
