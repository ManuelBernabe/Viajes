using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Ai;
using Viajes.Api.Data;

namespace Viajes.Api.Trips;

/// <summary>
/// «Sugerir lugares»: la IA configurada propone sitios del destino del viaje (qué ver, dónde comer…) que aún no estén en
/// la lista. Las ideas se guardan en el viaje (<see cref="PlaceIdea"/>) para no tener que pedirlas otra vez: cada nueva
/// petición añade ideas distintas a las que ya hay. Pasan a «Lugares» cuando alguien toca «Añadir»; «Quitar» las oculta.
/// </summary>
public static class PlaceSuggestions
{
    public const int MaxSuggestions = 12;

    public sealed record SuggestRequest(string? Lang, string? Category);

    public sealed record Suggestion(string Name, string Category, string Description, string? Address);

    public sealed record IdeaDto(Guid Id, string Name, string Category, string Description, string? Address);

    private static readonly Dictionary<string, string> Languages = new()
    {
        ["es"] = "español",
        ["en"] = "English",
        ["fr"] = "français",
        ["it"] = "italiano",
    };

    private const string SystemPrompt = """
        Eres un guía local experto que recomienda sitios a una familia que prepara un viaje. Propones lugares reales y
        conocidos del destino, variados y útiles: lo imprescindible para ver, dónde comer bien (locales típicos, no cadenas),
        dónde tomar algo, compras con encanto y naturaleza cercana. Nada de sitios inventados ni cerrados.
        """;

    private static readonly JsonElement Schema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            places = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        name = new { type = "string" },
                        category = new { type = "string", @enum = Place.Categories.ToArray() },
                        description = new { type = "string" },
                        address = new { type = new[] { "string", "null" } },
                    },
                    required = new[] { "name", "category", "description", "address" },
                    additionalProperties = false,
                },
            },
        },
        required = new[] { "places" },
        additionalProperties = false,
    });

    public static void MapPlaceSuggestions(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/trips/{id:guid}/place-suggestions", List).RequireAuthorization();
        app.MapPost("/api/trips/{id:guid}/place-suggestions", Suggest).RequireAuthorization();
        app.MapDelete("/api/trips/{id:guid}/place-suggestions/{ideaId:guid}", Dismiss).RequireAuthorization();
    }

    /// <summary>Las ideas guardadas del viaje que siguen pendientes: ni descartadas ni ya añadidas a «Lugares».</summary>
    private static async Task<IResult> List(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, CancellationToken ct)
    {
        var trip = await access.VisibleTrip(users.GetUserId(principal)!, id);
        if (trip is null || trip.DeletedAtMs is not null)
        {
            return Results.NotFound();
        }

        return Results.Ok(new { suggestions = await Pending(db, id, ct), added = 0 });
    }

    private static async Task<IResult> Dismiss(
        Guid id, Guid ideaId, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, CancellationToken ct)
    {
        var trip = await access.VisibleTrip(users.GetUserId(principal)!, id);
        var idea = trip is null ? null : await db.PlaceIdeas.FirstOrDefaultAsync(i => i.Id == ideaId && i.TripId == id, ct);
        if (idea is null)
        {
            return Results.NotFound();
        }

        idea.DismissedAtMs ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<List<IdeaDto>> Pending(AppDbContext db, Guid tripId, CancellationToken ct)
    {
        var places = (await db.Places.Where(p => p.TripId == tripId && p.DeletedAtMs == null).Select(p => p.Name).ToListAsync(ct))
            .Select(Key).ToHashSet();
        var ideas = await db.PlaceIdeas.Where(i => i.TripId == tripId && i.DismissedAtMs == null).ToListAsync(ct);
        return ideas
            .Where(i => !places.Contains(Key(i.Name)))
            .OrderByDescending(i => i.CreatedAtMs)
            .Select(i => new IdeaDto(i.Id, i.Name, i.Category, i.Description, i.Address))
            .ToList();
    }

    private static async Task<IResult> Suggest(
        Guid id, SuggestRequest? body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db,
        IJsonAsker ai, ILoggerFactory loggers, CancellationToken ct)
    {
        if (!ai.IsAvailable)
        {
            return Results.Problem("Las sugerencias con IA no están configuradas en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var userId = users.GetUserId(principal)!;
        var trip = await access.VisibleTrip(userId, id);
        if (trip is null || trip.DeletedAtMs is not null)
        {
            return Results.NotFound();
        }

        var destination = string.IsNullOrWhiteSpace(trip.Destination) ? trip.Title : trip.Destination;
        var existing = await db.Places.Where(p => p.TripId == id && p.DeletedAtMs == null).Select(p => p.Name).ToListAsync(ct);
        var known = await db.PlaceIdeas.Where(i => i.TripId == id).Select(i => i.Name).ToListAsync(ct);
        var language = Languages.GetValueOrDefault(body?.Lang ?? "es", "español");
        var category = body?.Category is { } c && Place.Categories.Contains(c) ? c : null;

        var prompt = $"""
            Destino del viaje: {destination}
            {(trip.Title != destination ? $"Nombre del viaje: {trip.Title}\n" : "")}{(trip.StartDate is not null ? $"Fechas: {trip.StartDate} a {trip.EndDate ?? trip.StartDate}\n" : "")}
            Propón {MaxSuggestions} sitios{(category is not null ? $" de la categoría «{category}»" : ", repartidos entre las categorías")}.
            Si el destino incluye varias ciudades o países, repártelos entre ellos.
            {(existing.Count + known.Count > 0 ? $"Ya están en la lista o ya se propusieron (no los repitas): {string.Join("; ", existing.Concat(known).Take(150))}." : "")}

            Para cada sitio:
            - name: el nombre con el que se busca en Google Maps (si hace falta, con la ciudad: «Café Tortoni, Buenos Aires»).
            - category: see (ver/visitar), eat (comer), drink (tomar algo), shop (compras), nature (naturaleza), other.
            - description: una frase corta en {language} con por qué merece la pena y un consejo práctico.
            - address: barrio o dirección si la conoces con seguridad; si no, null.
            """;

        var log = loggers.CreateLogger("Viajes.Places");
        var json = await ai.AskJsonAsync(SystemPrompt, prompt, Schema, 3000, ct);
        var suggestions = Parse(json, existing.Concat(known));
        if (suggestions is null)
        {
            log.LogWarning("Sugerencias de lugares: sin respuesta útil de la IA.");
            return Results.Problem("No se han podido conseguir sugerencias. Inténtalo dentro de un rato.", statusCode: StatusCodes.Status502BadGateway);
        }

        // Se guardan: la próxima vez que se abra el viaje siguen ahí. La primera de la tanda queda la más reciente.
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        db.PlaceIdeas.AddRange(suggestions.Select((s, index) => new PlaceIdea
        {
            Id = Guid.NewGuid(),
            TripId = id,
            Name = s.Name,
            Category = s.Category,
            Description = s.Description,
            Address = s.Address,
            CreatedAtMs = nowMs - index,
        }));
        await db.SaveChangesAsync(ct);

        log.LogInformation("Sugerencias de lugares: {Total} para «{Destino}».", suggestions.Count, destination);
        return Results.Ok(new { suggestions = await Pending(db, id, ct), added = suggestions.Count });
    }

    /// <summary>Lo que devuelve la IA, limpio: sin repetidos, sin los que ya están, con categorías válidas y longitudes sensatas.</summary>
    public static List<Suggestion>? Parse(string? json, IEnumerable<string> existing)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("places", out var places) || places.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var seen = new HashSet<string>(existing.Select(Key));
            var result = new List<Suggestion>();
            foreach (var item in places.EnumerateArray())
            {
                var name = Text(item, "name", 200);
                if (name is null || !seen.Add(Key(name)))
                {
                    continue;
                }

                var category = Text(item, "category", 20) is { } c && Place.Categories.Contains(c) ? c : "other";
                result.Add(new Suggestion(name, category, Text(item, "description", 500) ?? "", Text(item, "address", 300)));
                if (result.Count == MaxSuggestions)
                {
                    break;
                }
            }

            return result;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Key(string name) => name.Trim().ToLowerInvariant();

    private static string? Text(JsonElement item, string property, int max)
    {
        if (!item.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var text = value.GetString()?.Trim();
        return string.IsNullOrEmpty(text) ? null : text[..Math.Min(max, text.Length)];
    }
}
