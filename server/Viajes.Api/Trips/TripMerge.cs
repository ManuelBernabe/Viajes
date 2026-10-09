using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Trips;

/// <summary>
/// «Unir con otro viaje»: cuando una reserva acabó en un viaje nuevo que en realidad es parte de otro («Brasil» dentro de
/// «Argentina Brasil»), se pasa todo (reservas, lugares, ideas y equipaje) al otro viaje, sus fechas se amplían y este se
/// borra. Lo puede hacer quien administra el hogar o quien creó el viaje que desaparece.
/// </summary>
public static class TripMerge
{
    public sealed record MergeRequest(Guid Into);

    public static void MapTripMerge(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/trips/{id:guid}/merge", Merge).RequireAuthorization();
    }

    private static async Task<IResult> Merge(
        Guid id, MergeRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, CancellationToken ct)
    {
        var userId = users.GetUserId(principal)!;
        var source = await access.VisibleTrip(userId, id);
        var target = await access.VisibleTrip(userId, body.Into);
        if (source is null || target is null || source.DeletedAtMs is not null || target.DeletedAtMs is not null)
        {
            return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
        }

        if (source.Id == target.Id)
        {
            return Results.Problem("Elige otro viaje.", statusCode: StatusCodes.Status400BadRequest);
        }

        if (source.CreatedBy != userId && !await access.IsAdmin(userId))
        {
            return Results.Problem("Solo quien creó el viaje o quien administra el hogar puede unirlo con otro.", statusCode: StatusCodes.Status403Forbidden);
        }

        foreach (var booking in await db.Bookings.Where(b => b.TripId == source.Id).ToListAsync(ct))
        {
            booking.TripId = target.Id;
        }

        foreach (var place in await db.Places.Where(p => p.TripId == source.Id).ToListAsync(ct))
        {
            place.TripId = target.Id;
        }

        foreach (var idea in await db.PlaceIdeas.Where(p => p.TripId == source.Id).ToListAsync(ct))
        {
            idea.TripId = target.Id;
        }

        var already = (await db.PackingItems.Where(p => p.TripId == target.Id).Select(p => new { p.Text, p.ForWhom }).ToListAsync(ct))
            .Select(p => $"{p.Text.Trim().ToLowerInvariant()}|{p.ForWhom?.Trim().ToLowerInvariant()}")
            .ToHashSet();
        foreach (var item in await db.PackingItems.Where(p => p.TripId == source.Id).ToListAsync(ct))
        {
            if (already.Add($"{item.Text.Trim().ToLowerInvariant()}|{item.ForWhom?.Trim().ToLowerInvariant()}"))
            {
                item.TripId = target.Id;
            }
            else
            {
                db.PackingItems.Remove(item);
            }
        }

        target.StartDate = Earliest(target.StartDate, source.StartDate);
        target.EndDate = Latest(target.EndDate ?? target.StartDate, source.EndDate ?? source.StartDate);
        target.Destination ??= source.Destination;
        source.DeletedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Lo que se guardó del viaje (información del destino, enlace para compartir) ya no vale tal cual.
        var targetPrefix = $"dest:{target.Id:N}:";
        var sourceShare = ItineraryShare.TripKey(source.Id);
        var token = (await db.AppSettings.FirstOrDefaultAsync(a => a.Key == sourceShare, ct))?.Value;
        db.AppSettings.RemoveRange(db.AppSettings.Where(a =>
            a.Key.StartsWith(targetPrefix) || a.Key == sourceShare || (token != null && a.Key == ItineraryShare.TokenKey(token))));

        await db.SaveChangesAsync(ct);
        return Results.Ok(new { tripId = target.Id, target.StartDate, target.EndDate });
    }

    private static string? Earliest(string? a, string? b) => a is null ? b : b is null ? a : string.CompareOrdinal(a, b) <= 0 ? a : b;

    private static string? Latest(string? a, string? b) => a is null ? b : b is null ? a : string.CompareOrdinal(a, b) >= 0 ? a : b;
}
