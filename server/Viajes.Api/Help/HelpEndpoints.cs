using System.Text.Json;
using Viajes.Api.Ai;

namespace Viajes.Api.Help;

/// <summary>
/// «Pregunta a la guía»: un asistente que responde dudas sobre cómo usar la app con la guía (<see cref="AppGuide"/>) y la IA
/// configurada. Solo sabe de la app: no ve los viajes ni las reservas de nadie.
/// </summary>
public static class HelpEndpoints
{
    public const int MaxMessages = 10;
    public const int MaxChars = 1000;

    public sealed record ChatMessage(string? Role, string? Text);

    public sealed record AskRequest(List<ChatMessage>? Messages, string? Lang);

    public sealed record Answer(string Text, string? Route);

    /// <summary>Pantallas a las que el asistente puede ofrecer un botón «Ir a…».</summary>
    public static readonly IReadOnlySet<string> Routes = new HashSet<string>
    {
        "/", "/documents", "/documents/new", "/settings", "/inbox", "/trips/new", "/guia",
    };

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
            answer = new { type = "string" },
            route = new { type = new[] { "string", "null" } },
        },
        required = new[] { "answer", "route" },
        additionalProperties = false,
    });

    public static void MapHelpEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/help/ask", Ask).RequireAuthorization();
    }

    private static async Task<IResult> Ask(AskRequest body, IJsonAsker ai, ILoggerFactory loggers, CancellationToken ct)
    {
        if (!ai.IsAvailable)
        {
            return Results.Problem("El asistente necesita la IA, que no está configurada en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var messages = (body.Messages ?? [])
            .Where(m => !string.IsNullOrWhiteSpace(m.Text))
            .TakeLast(MaxMessages)
            .Select(m => (Role: m.Role == "assistant" ? "Asistente" : "Persona", Text: m.Text!.Trim()[..Math.Min(MaxChars, m.Text!.Trim().Length)]))
            .ToList();
        if (messages.Count == 0 || messages[^1].Role != "Persona")
        {
            return Results.Problem("Escribe una pregunta.", statusCode: StatusCodes.Status400BadRequest);
        }

        var language = Languages.GetValueOrDefault(body.Lang ?? "es", "español");
        var system = $"""
            Eres el asistente de ayuda de la app «Viajes». Respondes dudas sobre CÓMO USAR LA APP, solo con lo que dice esta guía.
            Reglas:
            - Responde en {language}, breve y práctico (2-6 frases o unos pocos pasos numerados), con los nombres de botones y
              pantallas tal como aparecen en la guía, entre comillas «».
            - Si la guía no lo cubre, dilo con sinceridad y sugiere lo más parecido que sí exista. No inventes funciones.
            - No pidas ni repitas contraseñas, números de documentos ni otros datos personales.
            - Si la pregunta no tiene que ver con la app, di amablemente que solo ayudas con la app.
            - route: si ayuda ir a una pantalla concreta, una de: {string.Join(", ", Routes)}; si no, null.

            {AppGuide.Text}
            """;
        var transcript = string.Join("\n\n", messages.Select(m => $"{m.Role}: {m.Text}"));
        var prompt = $"""
            Conversación hasta ahora:

            {transcript}

            Responde al último mensaje de la Persona.
            """;

        var json = await ai.AskJsonAsync(system, prompt, Schema, 700, ct);
        var answer = Parse(json);
        if (answer is null)
        {
            loggers.CreateLogger("Viajes.Help").LogWarning("Asistente de ayuda: sin respuesta útil de la IA.");
            return Results.Problem("El asistente no ha podido responder. Inténtalo de nuevo en un rato.", statusCode: StatusCodes.Status502BadGateway);
        }

        return Results.Ok(answer);
    }

    public static Answer? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var text = root.TryGetProperty("answer", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString()?.Trim() : null;
            if (string.IsNullOrEmpty(text))
            {
                return null;
            }

            var route = root.TryGetProperty("route", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null;
            return new Answer(text[..Math.Min(text.Length, 3000)], route is not null && Routes.Contains(route) ? route : null);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
