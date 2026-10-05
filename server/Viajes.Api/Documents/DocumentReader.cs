using System.Globalization;
using System.Text.Json;
using Viajes.Api.Ai;

namespace Viajes.Api.Documents;

/// <summary>
/// «Leer la foto» de un pasaporte, DNI, visado o seguro: la IA configurada lee la imagen o el PDF y propone los datos para
/// rellenar el formulario. Si se ve la zona de lectura mecánica (MRZ, las líneas con «&lt;&lt;&lt;»), sus dígitos de control
/// confirman el número y la caducidad, que entonces mandan sobre lo que haya leído la IA. No se guarda nada aquí.
/// </summary>
public static class DocumentReader
{
    public const long MaxBytes = 15_000_000;

    public sealed record ReadResult(
        string? Kind, string? GivenNames, string? Surnames, string? Number, string? Country, string? IssuedDate, string? ExpiryDate, bool MrzChecked);

    private const string SystemPrompt = """
        Lees documentos de viaje (pasaportes, DNI o carnés de identidad, visados, seguros de viaje, certificados de vacunación,
        carnés de conducir) a partir de una foto o un PDF. Extraes solo lo que se lee con claridad; si un dato no se ve, null.
        Nunca inventes. Si hay zona de lectura mecánica (MRZ: dos o tres líneas con muchos «<»), cópiala exactamente.
        """;

    private static readonly JsonElement Schema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            kind = new { type = new[] { "string", "null" } },
            givenNames = new { type = new[] { "string", "null" } },
            surnames = new { type = new[] { "string", "null" } },
            number = new { type = new[] { "string", "null" } },
            country = new { type = new[] { "string", "null" } },
            issuedDate = new { type = new[] { "string", "null" } },
            expiryDate = new { type = new[] { "string", "null" } },
            mrz = new { type = "array", items = new { type = "string" } },
        },
        required = new[] { "kind", "givenNames", "surnames", "number", "country", "issuedDate", "expiryDate", "mrz" },
        additionalProperties = false,
    });

    public static void MapDocumentReader(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/documents/read", Read).RequireAuthorization().DisableAntiforgery();
    }

    private static async Task<IResult> Read(HttpContext http, IJsonAsker ai, ILoggerFactory loggers, CancellationToken ct)
    {
        if (!ai.IsAvailable)
        {
            return Results.Problem("La lectura con IA no está configurada en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        if (http.Request.ContentLength is null or 0)
        {
            return Results.Problem("Falta el fichero.", statusCode: StatusCodes.Status400BadRequest);
        }

        if (http.Request.ContentLength > MaxBytes)
        {
            return Results.Problem("El fichero supera los 15 MB.", statusCode: StatusCodes.Status413PayloadTooLarge);
        }

        var mime = (http.Request.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
        if (mime != "application/pdf" && !mime.StartsWith("image/", StringComparison.Ordinal))
        {
            return Results.Problem("Envía una foto o un PDF.", statusCode: StatusCodes.Status415UnsupportedMediaType);
        }

        using var buffer = new MemoryStream();
        await http.Request.Body.CopyToAsync(buffer, ct);
        var prompt = """
            Lee este documento y devuelve:
            - kind: passport (pasaporte), id (DNI o carné de identidad), visa (visado, ESTA, eTA…), insurance (seguro de viaje),
              vaccine (vacuna o certificado), license (carné de conducir), other.
            - givenNames: el nombre o nombres de pila, como en el documento pero con mayúscula inicial («Francisco Javier»).
            - surnames: los apellidos, igual («Belso Pérez»).
            - number: el número del documento (en un DNI español, el número con su letra; en un seguro, la póliza).
            - country: el país que lo expide, en español («España», «Argentina»).
            - issuedDate y expiryDate: fecha de expedición y de caducidad (o fin de cobertura) en formato AAAA-MM-DD.
            - mrz: las líneas de la zona de lectura mecánica tal cual, sin espacios; [] si no hay.
            """;
        var json = await ai.AskJsonWithFilesAsync(SystemPrompt, prompt, [new ExtractionFile("documento", mime, buffer.ToArray())], Schema, 800, ct);
        var result = Parse(json);
        if (result is null)
        {
            loggers.CreateLogger("Viajes.Documents").LogWarning("Lectura de documento: sin respuesta útil de la IA ({Tipo}, {Bytes} bytes).", mime, buffer.Length);
            return Results.Problem("No se ha podido leer el documento. Prueba con otra foto, de frente y con buena luz.", statusCode: StatusCodes.Status422UnprocessableEntity);
        }

        return Results.Ok(result);
    }

    /// <summary>La respuesta de la IA, limpia y, si trae una MRZ válida, corregida con ella.</summary>
    public static ReadResult? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            string? Text(string name, int max) =>
                root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && value.GetString()?.Trim() is { Length: > 0 } text
                    ? text[..Math.Min(text.Length, max)]
                    : null;

            var kind = Text("kind", 20);
            var result = new ReadResult(
                kind is not null && Viajes.Api.Data.TravelDocument.Kinds.Contains(kind) ? kind : null,
                Text("givenNames", 100),
                Text("surnames", 100),
                Text("number", 100)?.Replace(" ", ""),
                Text("country", 100),
                Date(Text("issuedDate", 10)),
                Date(Text("expiryDate", 10)),
                false);

            var mrz = root.TryGetProperty("mrz", out var lines) && lines.ValueKind == JsonValueKind.Array
                ? lines.EnumerateArray().Where(l => l.ValueKind == JsonValueKind.String).Select(l => l.GetString()!).ToList()
                : [];
            var fromMrz = Mrz.Read(mrz);
            if (fromMrz is not null)
            {
                result = result with
                {
                    Kind = result.Kind ?? fromMrz.Kind,
                    Number = fromMrz.Kind == "passport" ? fromMrz.Number : result.Number ?? fromMrz.Number,
                    ExpiryDate = fromMrz.ExpiryDate,
                    MrzChecked = true,
                };
            }

            return result.Kind is null && result.Number is null && result.ExpiryDate is null && result.GivenNames is null ? null : result;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? Date(string? value) =>
        value is not null && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) ? value : null;
}

/// <summary>Zona de lectura mecánica (ICAO 9303): pasaportes (TD3, 2×44) y carnés (TD1, 3×30), con sus dígitos de control.</summary>
public static class Mrz
{
    public sealed record MrzData(string Kind, string Number, string ExpiryDate);

    public static MrzData? Read(IReadOnlyList<string> raw)
    {
        var lines = raw.Select(l => new string(l.ToUpperInvariant().Where(c => c is (>= 'A' and <= 'Z') or (>= '0' and <= '9') or '<').ToArray()))
            .Where(l => l.Length >= 28)
            .ToList();

        // Pasaporte: segunda línea = número(9) control nacionalidad(3) nacimiento(6) control sexo caducidad(6) control…
        if (lines.Count >= 2 && lines[^2].StartsWith('P') && lines[^1].Length >= 28)
        {
            var line = lines[^1];
            var number = line[..9];
            if (Valid(number, line[9]) && Valid(line[13..19], line[19]) && Valid(line[21..27], line[27]) && Expiry(line[21..27]) is { } expiry)
            {
                return new MrzData("passport", number.TrimEnd('<'), expiry);
            }
        }

        // Carné (TD1): primera línea = tipo(2) país(3) número(9) control…; segunda = nacimiento(6) control sexo caducidad(6) control…
        if (lines.Count >= 3 && lines[0].Length >= 15 && lines[1].Length >= 15 && lines[0][0] is 'I' or 'A' or 'C')
        {
            var number = lines[0][5..14];
            var second = lines[1];
            if (Valid(number, lines[0][14]) && Valid(second[..6], second[6]) && Valid(second[8..14], second[14]) && Expiry(second[8..14]) is { } expiry)
            {
                return new MrzData("id", number.TrimEnd('<'), expiry);
            }
        }

        return null;
    }

    /// <summary>Dígito de control: pesos 7, 3, 1; letras A=10…Z=35; «&lt;» vale 0.</summary>
    public static bool Valid(string field, char check)
    {
        if (!char.IsDigit(check))
        {
            return false;
        }

        int[] weights = [7, 3, 1];
        var sum = 0;
        for (var i = 0; i < field.Length; i++)
        {
            var c = field[i];
            var value = char.IsDigit(c) ? c - '0' : c is >= 'A' and <= 'Z' ? c - 'A' + 10 : 0;
            sum += value * weights[i % 3];
        }

        return sum % 10 == check - '0';
    }

    /// <summary>AAMMDD de caducidad → AAAA-MM-DD (siglo XXI salvo años 70-99).</summary>
    private static string? Expiry(string yymmdd)
    {
        if (!DateOnly.TryParseExact(yymmdd, "yyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            return null;
        }

        var year = int.Parse(yymmdd[..2], CultureInfo.InvariantCulture);
        var full = new DateOnly(year >= 70 ? 1900 + year : 2000 + year, date.Month, date.Day);
        return full.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
