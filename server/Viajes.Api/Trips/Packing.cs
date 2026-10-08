using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Trips;

/// <summary>
/// La lista de equipaje de cada viaje, compartida por el hogar: cosas con su grupo («Ropa», «Aseo»…), para quién son si
/// no son para todos, y si ya están en la maleta. Se puede llenar con plantillas o copiando la de otro viaje (la app).
/// </summary>
public static class Packing
{
    public const int MaxItems = 400;

    public sealed record ItemDto(Guid Id, string Text, string? Category, string? ForWhom, bool Checked, string? CheckedBy, long CreatedMs);

    public sealed record NewItem(string? Text, string? Category, string? ForWhom);

    public sealed record AddRequest(List<NewItem>? Items);

    public sealed record UpdateRequest(bool? Checked, string? Text, string? Category, string? ForWhom);

    private static ItemDto ToDto(PackingItem i) => new(i.Id, i.Text, i.Category, i.ForWhom, i.Checked, i.CheckedBy, i.CreatedMs);

    private static string? Clean(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, max)];

    public static void MapPacking(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/trips/{id:guid}/packing", async (Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db) =>
        {
            if (await access.VisibleTrip(users.GetUserId(principal)!, id) is null)
            {
                return Results.NotFound();
            }

            var items = await db.PackingItems.Where(i => i.TripId == id).OrderBy(i => i.CreatedMs).ToListAsync();
            return Results.Ok(items.Select(ToDto));
        }).RequireAuthorization();

        // Una o varias cosas a la vez (una plantilla entera). Las que ya están (mismo texto y para quién) no se repiten.
        app.MapPost("/api/trips/{id:guid}/packing", async (Guid id, AddRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db) =>
        {
            var userId = users.GetUserId(principal)!;
            if (await access.VisibleTrip(userId, id) is null)
            {
                return Results.NotFound();
            }

            var existing = await db.PackingItems.Where(i => i.TripId == id).ToListAsync();
            var keys = existing.Select(i => $"{i.Text.ToLowerInvariant()}|{i.ForWhom?.ToLowerInvariant()}").ToHashSet();
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var added = new List<PackingItem>();
            foreach (var item in body.Items ?? [])
            {
                var text = Clean(item.Text, 200);
                if (text is null || existing.Count + added.Count >= MaxItems)
                {
                    continue;
                }

                var forWhom = Clean(item.ForWhom, 100);
                if (!keys.Add($"{text.ToLowerInvariant()}|{forWhom?.ToLowerInvariant()}"))
                {
                    continue;
                }

                var row = new PackingItem
                {
                    Id = Guid.NewGuid(), TripId = id, Text = text, Category = Clean(item.Category, 40), ForWhom = forWhom, CreatedBy = userId,
                    CreatedMs = now + added.Count,
                };
                added.Add(row);
                db.PackingItems.Add(row);
            }

            await db.SaveChangesAsync();
            return Results.Ok(added.Select(ToDto));
        }).RequireAuthorization();

        app.MapPatch("/api/packing/{itemId:guid}", async (Guid itemId, UpdateRequest body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db) =>
        {
            var userId = users.GetUserId(principal)!;
            var item = await db.PackingItems.FirstOrDefaultAsync(i => i.Id == itemId);
            if (item is null || await access.VisibleTrip(userId, item.TripId) is null)
            {
                return Results.NotFound();
            }

            if (body.Checked is { } done)
            {
                item.Checked = done;
                item.CheckedBy = done ? principal.FindFirstValue(ClaimTypes.Email) ?? principal.Identity?.Name : null;
            }

            if (Clean(body.Text, 200) is { } text)
            {
                item.Text = text;
            }

            if (body.Category is not null)
            {
                item.Category = Clean(body.Category, 40);
            }

            if (body.ForWhom is not null)
            {
                item.ForWhom = Clean(body.ForWhom, 100);
            }

            await db.SaveChangesAsync();
            return Results.Ok(ToDto(item));
        }).RequireAuthorization();

        app.MapDelete("/api/packing/{itemId:guid}", async (Guid itemId, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db) =>
        {
            var item = await db.PackingItems.FirstOrDefaultAsync(i => i.Id == itemId);
            if (item is null || await access.VisibleTrip(users.GetUserId(principal)!, item.TripId) is null)
            {
                return Results.NotFound();
            }

            db.PackingItems.Remove(item);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();
    }
}
