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
/// la lista. Solo sugiere: nada se guarda hasta que alguien toca «Añadir».
/// </summary>
public static class PlaceSuggestions
{
    public const int MaxSuggestions = 12;

    public sealed record SuggestRequest(string? Lang, string? Category);

    public sealed record Suggestion(string Name, string Category, string Description, string? Address);

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
        app.MapPost("/api/trips/{id:guid}/place-suggestions", Suggest).RequireAuthorization();
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
        var language = Languages.GetValueOrDefault(body?.Lang ?? "es", "español");
        var category = body?.Category is { } c && Place.Categories.Contains(c) ? c : null;

        var prompt = $"""
            Destino del viaje: {destination}
            {(trip.Title != destination ? $"Nombre del viaje: {trip.Title}\n" : "")}{(trip.StartDate is not null ? $"Fechas: {trip.StartDate} a {trip.EndDate ?? trip.StartDate}\n" : "")}
            Propón {MaxSuggestions} sitios{(category is not null ? $" de la categoría «{category}»" : ", repartidos entre las categorías")}.
            Si el destino incluye varias ciudades o países, repártelos entre ellos.
            {(existing.Count > 0 ? $"Ya están en la lista (no los repitas): {string.Join("; ", existing.Take(60))}." : "")}

            Para cada sitio:
            - name: el nombre con el que se busca en Google Maps (si hace falta, con la ciudad: «Café Tortoni, Buenos Aires»).
            - category: see (ver/visitar), eat (comer), drink (tomar algo), shop (compras), nature (naturaleza), other.
            - description: una frase corta en {language} con por qué merece la pena y un consejo práctico.
            - address: barrio o dirección si la conoces con seguridad; si no, null.
            """;

        var log = loggers.CreateLogger("Viajes.Places");
        var json = await ai.AskJsonAsync(SystemPrompt, prompt, Schema, 3000, ct);
        var suggestions = Parse(json, existing);
        if (suggestions is null)
        {
            log.LogWarning("Sugerencias de lugares: sin respuesta útil de la IA.");
            return Results.Problem("No se han podido conseguir sugerencias. Inténtalo dentro de un rato.", statusCode: StatusCodes.Status502BadGateway);
        }

        log.LogInformation("Sugerencias de lugares: {Total} para «{Destino}».", suggestions.Count, destination);
        return Results.Ok(new { suggestions });
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
