using Anthropic;

namespace Viajes.Api.Ai;

public static class ExtractionEndpoints
{
    public const long MaxBytes = 20_000_000;

    public static IServiceCollection AddBookingExtractor(this IServiceCollection services, IConfiguration config)
    {
        var apiKey = config["ANTHROPIC_API_KEY"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            services.AddSingleton<IBookingExtractor, NoBookingExtractor>();
            return services;
        }

        services.AddSingleton(new AnthropicClient { ApiKey = apiKey });
        services.AddSingleton<IBookingExtractor, ClaudeBookingExtractor>();
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

        ExtractionInput input = mime.StartsWith("text/")
            ? new ExtractionInput(System.Text.Encoding.UTF8.GetString(bytes), [])
            : new ExtractionInput(null, [new ExtractionFile(string.IsNullOrEmpty(name) ? "fichero" : name, mime, bytes)]);

        var extraction = await extractor.ExtractAsync(input, ct);
        return extraction is null
            ? Results.Problem("No se ha encontrado ninguna reserva en el documento.", statusCode: StatusCodes.Status422UnprocessableEntity)
            : Results.Ok(extraction);
    }
}
