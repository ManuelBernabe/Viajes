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

    public sealed record Suggestion(string Name, string Category, string Description, string? Address, string? Area = null);

    public sealed record IdeaDto(Guid Id, string Name, string Category, string Description, string? Address, string? Area);

    private static readonly JsonElement AreasSchema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            areas = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new { name = new { type = "string" }, area = new { type = "string" } },
                    required = new[] { "name", "area" },
                    additionalProperties = false,
                },
            },
        },
        required = new[] { "areas" },
        additionalProperties = false,
    });

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
                        area = new { type = "string" },
                    },
                    required = new[] { "name", "category", "description", "address", "area" },
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

    /// <summary>Las ideas guardadas del viaje que no se han descartado.</summary>
    private static async Task<IResult> List(
        Guid id, string? lang, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IJsonAsker ai,
        ILoggerFactory loggers, CancellationToken ct)
    {
        var trip = await access.VisibleTrip(users.GetUserId(principal)!, id);
        if (trip is null || trip.DeletedAtMs is not null)
        {
            return Results.NotFound();
        }

        await FillAreas(db, ai, id, Languages.GetValueOrDefault(lang ?? "es", "español"), loggers, ct);
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

    /// <summary>
    /// Las ideas guardadas antes de que se apuntara el país (Area null) se clasifican una vez con la IA, para poder
    /// agruparlas por país. Si no se sabe, queda vacío y no se vuelve a preguntar.
    /// </summary>
    private static async Task FillAreas(AppDbContext db, IJsonAsker ai, Guid tripId, string language, ILoggerFactory loggers, CancellationToken ct)
    {
        var missing = await db.PlaceIdeas.Where(i => i.TripId == tripId && i.Area == null).ToListAsync(ct);
        if (missing.Count == 0)
        {
            return;
        }

        var areas = new Dictionary<string, string>();
        if (ai.IsAvailable)
        {
            var list = string.Join("\n", missing.Select(i => $"- {i.Name}{(i.Address is null ? "" : $" ({i.Address})")}"));
            var prompt = $"""
                Di en qué país está cada uno de estos sitios. area: el nombre del país en {language}, siempre igual escrito.
                name: el nombre tal cual te lo doy.
                {list}
                """;
            try
            {
                areas = ParseAreas(await ai.AskJsonAsync(SystemPrompt, prompt, AreasSchema, 1500, ct));
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                loggers.CreateLogger("Viajes.Places").LogWarning(error, "No se ha podido clasificar las ideas por país.");
            }
        }

        foreach (var idea in missing)
        {
            idea.Area = areas.GetValueOrDefault(Key(idea.Name), "");
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>{"areas": [{"name", "area"}]} → nombre normalizado → país. Lo que no se entiende se ignora.</summary>
    public static Dictionary<string, string> ParseAreas(string? json)
    {
        var result = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return result;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.TryGetProperty("areas", out var areas) && areas.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in areas.EnumerateArray())
                {
                    if (Text(item, "name", 200) is { } name && Text(item, "area", 100) is { } area)
                    {
                        result[Key(name)] = area;
                    }
                }
            }
        }
        catch (JsonException)
        {
        }

        return result;
    }

    /// <summary>
    /// Todas las ideas no descartadas, también las ya añadidas a «Lugares»: la app las oculta mientras el sitio siga en la
    /// lista y las vuelve a enseñar si se quita de ahí.
    /// </summary>
    private static async Task<List<IdeaDto>> Pending(AppDbContext db, Guid tripId, CancellationToken ct)
    {
        var ideas = await db.PlaceIdeas.Where(i => i.TripId == tripId && i.DismissedAtMs == null).ToListAsync(ct);
        return ideas
            .OrderByDescending(i => i.CreatedAtMs)
            .Select(i => new IdeaDto(i.Id, i.Name, i.Category, i.Description, i.Address, string.IsNullOrEmpty(i.Area) ? null : i.Area))
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
            - area: el país donde está el sitio, en {language} («Argentina», «Brasil»…), siempre igual escrito para el mismo país.
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
            Area = s.Area ?? "",
            CreatedAtMs = nowMs - index,
        }));
        await db.SaveChangesAsync(ct);

        log.LogInformation("Sugerencias de lugares: {Total} para «{Destino}».", suggestions.Count, destination);
        await FillAreas(db, ai, id, language, loggers, ct);
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
                result.Add(new Suggestion(name, category, Text(item, "description", 500) ?? "", Text(item, "address", 300), Text(item, "area", 100)));
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
