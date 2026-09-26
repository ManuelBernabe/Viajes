using Anthropic;

namespace Viajes.Api.Ai;

public static class ExtractionEndpoints
{
    public const long MaxBytes = 20_000_000;

    /// <summary>El proveedor lo decide la clave que exista, por este orden: Gemini (gratuito), DeepSeek, Anthropic; sin clave, nada.</summary>
    public static IServiceCollection AddBookingExtractor(this IServiceCollection services, IConfiguration config)
    {
        var geminiKey = config["GEMINI_API_KEY"];
        if (!string.IsNullOrWhiteSpace(geminiKey))
        {
            services.AddSingleton<IBookingExtractor>(provider =>
                new GeminiBookingExtractor(GeminiBookingExtractor.CreateClient(geminiKey), provider.GetRequiredService<ILogger<GeminiBookingExtractor>>()));
            return services;
        }

        var deepSeekKey = config["DEEPSEEK_API_KEY"];
        if (!string.IsNullOrWhiteSpace(deepSeekKey))
        {
            services.AddSingleton<IBookingExtractor>(provider =>
                new DeepSeekBookingExtractor(DeepSeekBookingExtractor.CreateClient(deepSeekKey), provider.GetRequiredService<ILogger<DeepSeekBookingExtractor>>()));
            return services;
        }

        var anthropicKey = config["ANTHROPIC_API_KEY"];
        if (!string.IsNullOrWhiteSpace(anthropicKey))
        {
            services.AddSingleton(new AnthropicClient { ApiKey = anthropicKey });
            services.AddSingleton<IBookingExtractor, ClaudeBookingExtractor>();
            return services;
        }

        services.AddSingleton<IBookingExtractor, NoBookingExtractor>();
        return services;
    }

    public static void MapExtractionEndpoints(this IEndpointRouteBuilder app)
    {
        // El cuerpo es el propio fichero (PDF o imagen) o texto plano; el tipo lo dice Content-Type.
        app.MapPost("/api/extract", Extract).RequireAuthorization().DisableAntiforgery();
    }

    private static async Task<IResult> Extract(HttpContext http, IBookingExtractor extractor, CancellationToken ct)
    {
        if (!extractor.IsAvailable)
        {
            return Results.Problem("La lectura con IA no está configurada en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        if (http.Request.ContentLength is null)
        {
            return Results.Problem("Falta el tamaño del fichero.", statusCode: StatusCodes.Status411LengthRequired);
        }

        if (http.Request.ContentLength > MaxBytes)
        {
            return Results.Problem("El fichero supera los 20 MB.", statusCode: StatusCodes.Status413PayloadTooLarge);
        }

        using var buffer = new MemoryStream();
        await http.Request.Body.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();
        var mime = (http.Request.ContentType ?? "application/octet-stream").Split(';')[0].Trim().ToLowerInvariant();
        var name = http.Request.Query["name"].ToString();

        ExtractionInput input;
        if (mime == "application/json")
        {
            // La app manda texto ya extraído más páginas como imagen: {"text": "...", "files": [{"name","mime","data"}]}.
            var request = System.Text.Json.JsonSerializer.Deserialize<JsonRequest>(bytes, JsonOptions);
            if (request is null)
            {
                return Results.Problem("Petición no válida.", statusCode: StatusCodes.Status400BadRequest);
            }

            var files = new List<ExtractionFile>();
            foreach (var file in request.Files ?? [])
            {
                try
                {
                    files.Add(new ExtractionFile(file.Name ?? "fichero", (file.Mime ?? "application/octet-stream").ToLowerInvariant(), Convert.FromBase64String(file.Data ?? "")));
                }
                catch (FormatException)
                {
                    return Results.Problem("Fichero mal codificado.", statusCode: StatusCodes.Status400BadRequest);
                }
            }

            input = new ExtractionInput(string.IsNullOrWhiteSpace(request.Text) ? null : request.Text, files);
        }
        else
        {
            input = mime.StartsWith("text/")
                ? new ExtractionInput(System.Text.Encoding.UTF8.GetString(bytes), [])
                : new ExtractionInput(null, [new ExtractionFile(string.IsNullOrEmpty(name) ? "fichero" : name, mime, bytes)]);
        }

        var extraction = await extractor.ExtractAsync(input, ct);
        return extraction is null
            ? Results.Problem("No se ha encontrado ninguna reserva en el documento.", statusCode: StatusCodes.Status422UnprocessableEntity)
            : Results.Ok(extraction);
    }

    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private sealed record JsonRequest(string? Text, List<JsonFile>? Files);

    private sealed record JsonFile(string? Name, string? Mime, string? Data);
}
