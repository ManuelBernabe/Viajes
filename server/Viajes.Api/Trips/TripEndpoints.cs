using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;
using Viajes.Api.Storage;

namespace Viajes.Api.Trips;

public static partial class TripEndpoints
{
    public const long MaxAttachmentBytes = 20_000_000;

    public static void MapTripEndpoints(this IEndpointRouteBuilder app)
    {
        var trips = app.MapGroup("/api/trips").RequireAuthorization();
        trips.MapPut("/{id:guid}", PutTrip);
        trips.MapDelete("/{id:guid}", DeleteTrip);

        var bookings = app.MapGroup("/api/bookings").RequireAuthorization();
        bookings.MapPut("/{id:guid}", PutBooking);
        bookings.MapDelete("/{id:guid}", DeleteBooking);

        var attachments = app.MapGroup("/api/attachments").RequireAuthorization();
        attachments.MapPut("/{id:guid}", PutAttachment);
        attachments.MapPut("/{id:guid}/content", PutAttachmentContent);
        attachments.MapGet("/{id:guid}/content", GetAttachmentContent);
        attachments.MapDelete("/{id:guid}", DeleteAttachment);

        var places = app.MapGroup("/api/places").RequireAuthorization();
        places.MapPut("/{id:guid}", PutPlace);
        places.MapDelete("/{id:guid}", DeletePlace);

        app.MapGet("/api/sync", Sync).RequireAuthorization();
    }

    // ---- Viajes ----

    private static async Task<IResult> PutTrip(
        Guid id, TripBody body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var title = body.Title?.Trim();
        if (string.IsNullOrEmpty(title) || title.Length > 200)
        {
            return Problem("El viaje necesita un título (hasta 200 caracteres).", StatusCodes.Status400BadRequest);
        }

        if (!IsDate(body.StartDate) || !IsDate(body.EndDate))
        {
            return Problem("Las fechas van como «2026-10-12».", StatusCodes.Status400BadRequest);
        }

        var householdId = await access.EnsureHousehold(userId);
        var trip = await db.Trips.FindAsync(id);
        if (trip is null)
        {
            db.Trips.Add(new Trip
            {
                Id = id,
                HouseholdId = householdId,
                Title = title,
                Destination = Clean(body.Destination, 200),
                StartDate = body.StartDate,
                EndDate = body.EndDate,
                CreatedBy = userId,
            });
        }
        else
        {
            if (trip.HouseholdId != householdId)
            {
                return NotFound();
            }

            if (trip.DeletedAtMs is not null)
            {
                return Gone("El viaje se ha borrado.");
            }

            trip.Title = title;
            trip.Destination = Clean(body.Destination, 200);
            trip.StartDate = body.StartDate;
            trip.EndDate = body.EndDate;
        }

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteTrip(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var trip = await access.VisibleTrip(userId, id);
        if (trip is null)
        {
            return NotFound();
        }

        var now = Now();
        var bookingIds = await db.Bookings.Where(b => b.TripId == id).Select(b => b.Id).ToListAsync(ct);
        var attachments = await db.Attachments.Where(a => bookingIds.Contains(a.BookingId) && a.DeletedAtMs == null).ToListAsync(ct);
        foreach (var attachment in attachments)
        {
            attachment.DeletedAtMs = now;
        }

        foreach (var booking in await db.Bookings.Where(b => b.TripId == id && b.DeletedAtMs == null).ToListAsync(ct))
        {
            booking.DeletedAtMs = now;
        }

        foreach (var place in await db.Places.Where(p => p.TripId == id && p.DeletedAtMs == null).ToListAsync(ct))
        {
            place.DeletedAtMs = now;
        }

        trip.DeletedAtMs ??= now;
        await db.SaveChangesAsync(ct);
        await DeleteFiles(store, attachments, ct);
        return Results.NoContent();
    }

    // ---- Lugares recomendados ----

    private static async Task<IResult> PutPlace(
        Guid id, PlaceBody body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var name = body.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 200)
        {
            return Problem("El lugar necesita un nombre (hasta 200 caracteres).", StatusCodes.Status400BadRequest);
        }

        var category = body.Category ?? "see";
        if (!Place.Categories.Contains(category))
        {
            return Problem("Categoría de lugar desconocida.", StatusCodes.Status400BadRequest);
        }

        var url = Clean(body.Url, 1000);
        if (url is not null && !(Uri.TryCreate(url, UriKind.Absolute, out var parsed) && parsed.Scheme is "http" or "https"))
        {
            return Problem("El enlace tiene que empezar por http:// o https://.", StatusCodes.Status400BadRequest);
        }

        var trip = await access.VisibleTrip(userId, body.TripId);
        if (trip is null || trip.DeletedAtMs is not null)
        {
            return NotFound();
        }

        var place = await db.Places.FindAsync(id);
        if (place is null)
        {
            db.Places.Add(new Place
            {
                Id = id,
                TripId = trip.Id,
                Name = name,
                Category = category,
                Notes = Clean(body.Notes, 2000),
                Url = url,
                Address = Clean(body.Address, 300),
                Visited = body.Visited,
                CreatedBy = userId,
                CreatedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            });
        }
        else
        {
            if (place.TripId != trip.Id)
            {
                return NotFound();
            }

            if (place.DeletedAtMs is not null)
            {
                return Gone("El lugar se ha borrado.");
            }

            place.Name = name;
            place.Category = category;
            place.Notes = Clean(body.Notes, 2000);
            place.Url = url;
            place.Address = Clean(body.Address, 300);
            place.Visited = body.Visited;
        }

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DeletePlace(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var place = await access.VisiblePlaces(userId).FirstOrDefaultAsync(p => p.Id == id);
        if (place is null)
        {
            return NotFound();
        }

        place.DeletedAtMs ??= Now();
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ---- Reservas ----

    private static async Task<IResult> PutBooking(
        Guid id, BookingBody body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, Push.PushService push, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var title = body.Title?.Trim();
        if (string.IsNullOrEmpty(title) || title.Length > 200)
        {
            return Problem("La reserva necesita un título (hasta 200 caracteres).", StatusCodes.Status400BadRequest);
        }

        if (body.Type is null || !Booking.Types.Contains(body.Type))
        {
            return Problem("Tipo de reserva desconocido.", StatusCodes.Status400BadRequest);
        }

        if (body.StartLocal is null || !LocalTime.IsValidLocal(body.StartLocal))
        {
            return Problem("La salida necesita fecha y hora («2026-10-12T10:05»).", StatusCodes.Status400BadRequest);
        }

        if (body.StartTz is null || !LocalTime.IsValidZone(body.StartTz))
        {
            return Problem("Zona horaria de salida desconocida.", StatusCodes.Status400BadRequest);
        }

        if (body.EndLocal is not null && (!LocalTime.IsValidLocal(body.EndLocal) || body.EndTz is null || !LocalTime.IsValidZone(body.EndTz)))
        {
            return Problem("La llegada necesita fecha, hora y una zona horaria válida.", StatusCodes.Status400BadRequest);
        }

        var trip = await access.VisibleTrip(userId, body.TripId);
        if (trip is null)
        {
            return NotFound();
        }

        if (trip.DeletedAtMs is not null)
        {
            return Gone("El viaje se ha borrado.");
        }

        var booking = await db.Bookings.FindAsync(id);
        if (booking is null)
        {
            booking = new Booking
            {
                Id = id, TripId = trip.Id, Type = body.Type, Title = title, StartLocal = body.StartLocal, StartTz = body.StartTz,
                CreatedBy = userId,
            };
            db.Bookings.Add(booking);
        }
        else
        {
            // Una reserva de otro miembro que no se puede ver tampoco se puede pisar, aunque se conozca su id.
            if (booking.TripId != trip.Id || !await access.VisibleBookings(userId).AnyAsync(b => b.Id == id, ct))
            {
                return NotFound();
            }

            if (booking.DeletedAtMs is not null)
            {
                return Gone("La reserva se ha borrado.");
            }
        }

        booking.Type = body.Type;
        booking.Title = title;
        booking.StartLocal = body.StartLocal;
        booking.StartTz = body.StartTz;
        booking.StartPlace = Clean(body.StartPlace, 200);
        booking.EndLocal = body.EndLocal;
        booking.EndTz = body.EndLocal is null ? null : body.EndTz;
        booking.EndPlace = Clean(body.EndPlace, 200);
        booking.StartUtcMs = LocalTime.ToUtcMs(body.StartLocal, body.StartTz);
        booking.Reference = Clean(body.Reference, 100);
        booking.Address = Clean(body.Address, 500);
        booking.Notes = Clean(body.Notes, 4000);
        var previousNote = booking.ChangeNote;
        booking.ChangeNote = Clean(body.ChangeNote, 1000);

        // Quién la ve: al crearla, todo el hogar si la crea quien administra y solo su creador si la crea un invitado.
        // Solo su creador o quien administra pueden cambiarlo; quien la ve por estar compartida con él, no.
        var isNew = db.Entry(booking).State == EntityState.Added;
        var isAdmin = await access.IsAdmin(userId);
        if (isNew)
        {
            booking.Visibility = isAdmin ? Booking.VisibleToHousehold : Booking.VisibleToCreator;
        }

        if (body.Visibility is not null && (isAdmin || booking.CreatedBy == userId))
        {
            if (!Booking.Visibilities.Contains(body.Visibility))
            {
                return Problem("Visibilidad desconocida.", StatusCodes.Status400BadRequest);
            }

            booking.Visibility = body.Visibility;
            if (body.SharedWith is not null)
            {
                // Solo personas del hogar; se sustituye la lista entera.
                var memberIds = await db.HouseholdMembers
                    .Where(m => m.HouseholdId == trip.HouseholdId && m.DeletedAtMs == null && body.SharedWith.Contains(m.UserId))
                    .Select(m => m.UserId)
                    .ToListAsync(ct);
                var current = await db.BookingShares.Where(s => s.BookingId == booking.Id).ToListAsync(ct);
                db.BookingShares.RemoveRange(current.Where(s => !memberIds.Contains(s.UserId)));
                db.BookingShares.AddRange(memberIds.Where(m => current.All(s => s.UserId != m)).Select(m => new BookingShare { BookingId = booking.Id, UserId = m }));
            }
        }

        await db.SaveChangesAsync(ct);

        // Un aviso de modificación nuevo se comunica al instante a los móviles de quienes ven la reserva.
        if (booking.ChangeNote is not null && booking.ChangeNote != previousNote)
        {
            try
            {
                await push.SendToUsersAsync(await access.BookingAudience(booking), Push.Reminders.ChangeMessage(booking), ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // El aviso es un extra: la reserva ya está guardada.
                _ = e;
            }
        }

        return Results.NoContent();
    }

    private static async Task<IResult> DeleteBooking(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var booking = await access.VisibleBooking(userId, id);
        if (booking is null)
        {
            return NotFound();
        }

        var now = Now();
        var attachments = await db.Attachments.Where(a => a.BookingId == id && a.DeletedAtMs == null).ToListAsync(ct);
        foreach (var attachment in attachments)
        {
            attachment.DeletedAtMs = now;
        }

        booking.DeletedAtMs ??= now;
        await db.SaveChangesAsync(ct);
        await DeleteFiles(store, attachments, ct);
        return Results.NoContent();
    }

    // ---- Adjuntos ----

    private static async Task<IResult> PutAttachment(
        Guid id, AttachmentBody body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var name = Clean(body.Name, 255);
        var mime = Clean(body.Mime, 100);
        if (name is null || mime is null)
        {
            return Problem("El adjunto necesita nombre y tipo.", StatusCodes.Status400BadRequest);
        }

        if (body.Size < 0 || body.Size > MaxAttachmentBytes)
        {
            return Problem("El fichero supera los 20 MB.", StatusCodes.Status413PayloadTooLarge);
        }

        var booking = await access.VisibleBooking(userId, body.BookingId);
        if (booking is null)
        {
            return NotFound();
        }

        if (booking.DeletedAtMs is not null)
        {
            return Gone("La reserva se ha borrado.");
        }

        var attachment = await db.Attachments.FindAsync(id);
        if (attachment is null)
        {
            var trip = await db.Trips.SingleAsync(t => t.Id == booking.TripId);
            db.Attachments.Add(new Attachment
            {
                Id = id,
                BookingId = booking.Id,
                FileKey = $"households/{trip.HouseholdId}/trips/{trip.Id}/{booking.Id}/{id}",
                Name = name,
                Mime = mime,
                Size = body.Size,
                QrText = Clean(body.QrText, 4000),
                CreatedBy = userId,
            });
        }
        else
        {
            if (attachment.BookingId != booking.Id)
            {
                return NotFound();
            }

            if (attachment.DeletedAtMs is not null)
            {
                return Gone("El adjunto se ha borrado.");
            }

            attachment.Name = name;
            attachment.QrText = Clean(body.QrText, 4000);
        }

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> PutAttachmentContent(
        Guid id, HttpContext http, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store, CancellationToken ct)
    {
        var length = http.Request.ContentLength;
        if (length is null)
        {
            return Problem("Falta el tamaño del fichero.", StatusCodes.Status411LengthRequired);
        }

        if (length > MaxAttachmentBytes)
        {
            return Problem("El fichero supera los 20 MB.", StatusCodes.Status413PayloadTooLarge);
        }

        var userId = users.GetUserId(principal)!;
        var attachment = await access.VisibleAttachment(userId, id);
        if (attachment is null || attachment.DeletedAtMs is not null)
        {
            return NotFound();
        }

        await store.WriteAsync(attachment.FileKey, http.Request.Body, attachment.Mime, ct);
        attachment.Uploaded = true;
        attachment.Size = length.Value;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> GetAttachmentContent(
        Guid id, HttpContext http, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, IFileStore store, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var attachment = await access.VisibleAttachment(userId, id);
        if (attachment is null || attachment.DeletedAtMs is not null || !attachment.Uploaded)
        {
            return NotFound();
        }

        var file = await store.OpenReadAsync(attachment.FileKey, ct);
        if (file is null)
        {
            return NotFound();
        }

        http.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        return FileResponses.Serve(http, file);
    }

    private static async Task<IResult> DeleteAttachment(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var attachment = await access.VisibleAttachment(userId, id);
        if (attachment is null)
        {
            return NotFound();
        }

        attachment.DeletedAtMs ??= Now();
        await db.SaveChangesAsync(ct);
        await DeleteFiles(store, [attachment], ct);
        return Results.NoContent();
    }

    // ---- Sincronización ----

    private static async Task<IResult> Sync(
        long? since, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var from = since ?? 0;

        // Una transacción de lectura: en modo WAL todas las consultas ven la misma instantánea, así que la
        // «version» devuelta no puede saltarse una fila que se confirmara entre dos consultas.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var version = await db.ChangeCounter.Select(c => c.Value).SingleAsync(ct);
        var visibleTrips = access.VisibleTrips(userId);
        var tripIds = await visibleTrips.Where(t => t.DeletedAtMs == null).Select(t => t.Id).ToListAsync(ct);
        var trips = await visibleTrips.Where(t => t.Version > from).OrderBy(t => t.Version).ToListAsync(ct);
        var bookings = await access.VisibleBookings(userId).Where(b => b.Version > from).OrderBy(b => b.Version).ToListAsync(ct);
        var visibleBookingIds = await access.VisibleBookings(userId).Where(b => b.DeletedAtMs == null).Select(b => b.Id).ToListAsync(ct);
        var attachments = await access.VisibleAttachments(userId).Where(a => a.Version > from).OrderBy(a => a.Version).ToListAsync(ct);
        var bookingIds = bookings.Select(b => b.Id).ToList();
        var shares = (await db.BookingShares.Where(s => bookingIds.Contains(s.BookingId)).ToListAsync(ct))
            .GroupBy(s => s.BookingId)
            .ToDictionary(g => g.Key, g => g.Select(s => s.UserId).ToList());
        var inbox = await access.VisibleInboxItems(userId).Where(i => i.Version > from).OrderBy(i => i.Version).ToListAsync(ct);
        var inboxIds = inbox.Select(i => i.Id).ToList();
        var inboxAttachments = await db.InboxAttachments.Where(a => inboxIds.Contains(a.InboxItemId)).ToListAsync(ct);
        var places = await access.VisiblePlaces(userId).Where(p => p.Version > from).OrderBy(p => p.Version).ToListAsync(ct);
        await transaction.CommitAsync(ct);

        return Results.Ok(new SyncResponse(
            version,
            tripIds,
            visibleBookingIds,
            trips.Select(TripDto.From).ToList(),
            bookings.Select(b => BookingDto.From(b, shares.GetValueOrDefault(b.Id))).ToList(),
            attachments.Select(AttachmentDto.From).ToList(),
            inbox.Select(i => Inbox.InboxEndpoints.ToDto(i, inboxAttachments.Where(a => a.InboxItemId == i.Id))).ToList(),
            places.Select(PlaceDto.From).ToList()));
    }

    // ---- Auxiliares ----

    private static async Task DeleteFiles(IFileStore store, IEnumerable<Attachment> attachments, CancellationToken ct)
    {
        foreach (var attachment in attachments.Where(a => a.Uploaded))
        {
            try
            {
                await store.DeleteAsync(attachment.FileKey, ct);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // La fila ya está borrada; un fichero huérfano no bloquea al usuario.
            }
        }
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private static string? Clean(string? value, int max)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed[..Math.Min(max, trimmed.Length)];
    }

    private static bool IsDate(string? value) => value is null || DatePattern().IsMatch(value);

    private static IResult Problem(string detail, int status) => Results.Problem(detail, statusCode: status);

    private static IResult NotFound() => Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);

    private static IResult Gone(string detail) => Results.Problem(detail, statusCode: StatusCodes.Status409Conflict);

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
    private static partial Regex DatePattern();
}
