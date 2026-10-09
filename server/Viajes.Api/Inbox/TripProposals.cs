using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Ai;

namespace Viajes.Api.Inbox;

/// <summary>
/// ¿A qué viaje va la reserva? Al revisar un correo, la IA mira la reserva (tipo, lugares, fechas, asunto) y los viajes del
/// hogar: dice si pertenece a uno de ellos (sabe que IGR es Iguazú, en Argentina) o propone un viaje nuevo con un nombre corto
/// y el destino. Solo propone: el viaje lo crea la app al confirmar.
/// </summary>
public static class TripProposals
{
    public sealed record ProposalRequest(string? Lang);

    public sealed record Proposal(string Title, string? Destination, Guid? TripId = null);

    private static readonly Dictionary<string, string> Languages = new()
    {
        ["es"] = "español",
        ["en"] = "English",
        ["fr"] = "français",
        ["it"] = "italiano",
    };

    private static readonly JsonElement Schema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            tripId = new { type = new[] { "string", "null" } },
            title = new { type = "string" },
            destination = new { type = new[] { "string", "null" } },
        },
        required = new[] { "tripId", "title", "destination" },
        additionalProperties = false,
    });

    private const string SystemPrompt = """
        Ayudas a organizar reservas de viaje en viajes. A partir de una reserva (vuelo, tren, hotel…) propones el viaje al
        que pertenece: un nombre corto y natural, como lo diría una familia («Lisboa», «Roma en Navidad», «Argentina»), y el
        destino (ciudad o, si es un viaje por un país, el país). Nunca uses códigos de aeropuerto: escribe el nombre de la ciudad.
        """;

    public static void MapTripProposals(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbox/{id:guid}/trip-proposal", Propose).RequireAuthorization();
    }

    private static async Task<IResult> Propose(
        Guid id, ProposalRequest? body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, IJsonAsker ai,
        ILoggerFactory loggers, CancellationToken ct)
    {
        if (!ai.IsAvailable)
        {
            return Results.Problem("La lectura con IA no está configurada en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var userId = users.GetUserId(principal)!;
        var item = await access.VisibleInboxItems(userId).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null)
        {
            return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
        }

        var language = Languages.GetValueOrDefault(body?.Lang ?? "es", "español");
        var trips = await access.VisibleTrips(userId).Where(t => t.DeletedAtMs == null)
            .Select(t => new { t.Id, t.Title, t.Destination, t.StartDate, t.EndDate })
            .ToListAsync(ct);
        var tripIds = trips.Select(t => t.Id).ToList();
        var placeRows = await access.VisibleBookings(userId)
            .Where(b => tripIds.Contains(b.TripId) && b.DeletedAtMs == null)
            .Select(b => new { b.TripId, b.Type, b.StartPlace, b.EndPlace })
            .ToListAsync(ct);
        var placesByTrip = placeRows
            .GroupBy(b => b.TripId)
            .ToDictionary(g => g.Key, g => string.Join(", ", g
                .SelectMany(b => b.Type is "flight" or "train" ? new[] { b.StartPlace, b.EndPlace } : new[] { b.StartPlace })
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => p!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(15)));
        var tripList = trips.Count == 0
            ? "(ninguno)"
            : string.Join("\n", trips.Select(t =>
                $"- {t.Id} | {t.Title} | destino: {t.Destination ?? "?"} | fechas: {t.StartDate ?? "?"} a {t.EndDate ?? t.StartDate ?? "?"} | sitios: {placesByTrip.GetValueOrDefault(t.Id) ?? "?"}"));
        var text = item.BodyText is null ? "" : item.BodyText[..Math.Min(item.BodyText.Length, 2000)];
        var prompt = $"""
            Reserva:
            - Tipo: {item.SuggestedType ?? "?"}
            - Título: {item.SuggestedTitle ?? "?"}
            - Salida o entrada: {item.SuggestedStartLocal ?? "?"} en {item.SuggestedStartPlace ?? "?"}
            - Llegada o salida: {item.SuggestedEndLocal ?? "?"} en {item.SuggestedEndPlace ?? "?"}
            - Dirección: {item.SuggestedAddress ?? "?"}
            - Asunto del correo: {item.Subject}

            Principio del correo:
            {text}

            Viajes que ya tiene el hogar (id | nombre | destino | fechas):
            {tripList}

            Responde en {language}:
            - tripId: el id del viaje al que pertenece esta reserva, si encaja en uno por lugar y fechas (un vuelo de ida o
              de vuelta puede ser uno o dos días antes o después). Las fechas de un viaje se amplían solas: una etapa más que
              sale de uno de sus sitios o va a un país o ciudad de su nombre o destino, unos días después de su fin, es de ese
              viaje (un vuelo Buenos Aires → Río tras «Argentina Brasil» es de ese viaje, no uno nuevo «Brasil»). Null solo si
              es claramente otro viaje: sale de casa, o es otro destino en otras fechas.
            - title: si tripId es null, nombre corto del viaje nuevo (2-4 palabras). Para un vuelo o un tren, el destino, no el
              origen. Si tripId no es null, el nombre de ese viaje.
            - destination: la ciudad de destino (o del hotel); null si no se sabe.
            """;

        var json = await ai.AskJsonAsync(SystemPrompt, prompt, Schema, 300, ct);
        var proposal = Parse(json, trips.Select(t => t.Id).ToHashSet());
        if (proposal is null)
        {
            loggers.CreateLogger("Viajes.Inbox").LogWarning("Propuesta de viaje: sin respuesta útil de la IA.");
            return Results.Problem("No se ha podido proponer un viaje. Escribe el nombre a mano.", statusCode: StatusCodes.Status502BadGateway);
        }

        return Results.Ok(proposal);
    }

    /// <summary>La respuesta de la IA, limpia. Un tripId que no es de los viajes del hogar se ignora (viaje nuevo).</summary>
    public static Proposal? Parse(string? json, IReadOnlySet<Guid>? tripIds = null)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var title = root.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString()?.Trim() : null;
            if (string.IsNullOrEmpty(title))
            {
                return null;
            }

            var destination = root.TryGetProperty("destination", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString()?.Trim() : null;
            Guid? tripId = root.TryGetProperty("tripId", out var tid) && tid.ValueKind == JsonValueKind.String
                && Guid.TryParse(tid.GetString(), out var parsed) && tripIds?.Contains(parsed) == true
                ? parsed
                : null;
            return new Proposal(
                title[..Math.Min(title.Length, 200)],
                string.IsNullOrEmpty(destination) ? null : destination[..Math.Min(destination.Length, 200)],
                tripId);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
