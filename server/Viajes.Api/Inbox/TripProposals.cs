using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Ai;

namespace Viajes.Api.Inbox;

/// <summary>
/// «Viaje nuevo» al revisar un correo: cuando la reserva no encaja en ningún viaje, la IA propone un nombre corto y el
/// destino a partir de lo que se leyó (tipo, lugares, fechas, asunto). Solo propone: el viaje lo crea la app al confirmar.
/// </summary>
public static class TripProposals
{
    public sealed record ProposalRequest(string? Lang);

    public sealed record Proposal(string Title, string? Destination);

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
            title = new { type = "string" },
            destination = new { type = new[] { "string", "null" } },
        },
        required = new[] { "title", "destination" },
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

        var item = await access.VisibleInboxItems(users.GetUserId(principal)!).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null)
        {
            return Results.Problem("No existe o no tienes acceso.", statusCode: StatusCodes.Status404NotFound);
        }

        var language = Languages.GetValueOrDefault(body?.Lang ?? "es", "español");
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

            Responde en {language}:
            - title: nombre corto del viaje (2-4 palabras). Para un vuelo o un tren, el destino, no el origen.
            - destination: la ciudad de destino (o del hotel); null si no se sabe.
            """;

        var json = await ai.AskJsonAsync(SystemPrompt, prompt, Schema, 300, ct);
        var proposal = Parse(json);
        if (proposal is null)
        {
            loggers.CreateLogger("Viajes.Inbox").LogWarning("Propuesta de viaje: sin respuesta útil de la IA.");
            return Results.Problem("No se ha podido proponer un viaje. Escribe el nombre a mano.", statusCode: StatusCodes.Status502BadGateway);
        }

        return Results.Ok(proposal);
    }

    public static Proposal? Parse(string? json)
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
            return new Proposal(title[..Math.Min(title.Length, 200)], string.IsNullOrEmpty(destination) ? null : destination[..Math.Min(destination.Length, 200)]);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
