using System.Text.Json;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;

namespace Viajes.Api.Ai;

/// <summary>
/// Lee billetes y confirmaciones (PDF, imágenes o texto) con Claude y devuelve los campos de la reserva
/// como JSON validado contra un esquema. El modelo solo extrae: lo que no está en el documento queda a null.
/// </summary>
public sealed class ClaudeBookingExtractor(AnthropicClient client, ILogger<ClaudeBookingExtractor> log, string? model = null, string? lightModel = null)
    : IBookingExtractor, IJsonAsker
{
    public const string ModelId = "claude-opus-5";

    /// <summary>Para preguntas sin ficheros (a qué viaje va una reserva, ideas, destino, ayuda): más barato y de sobra.</summary>
    public const string LightModelId = "claude-sonnet-5-5";

    /// <summary>El modelo para leer billetes y documentos (CLAUDE_MODEL lo cambia).</summary>
    public string Model { get; } = string.IsNullOrWhiteSpace(model) ? ModelId : model.Trim();

    /// <summary>El de las preguntas sin ficheros (CLAUDE_LIGHT_MODEL lo cambia).</summary>
    public string LightModel { get; } = string.IsNullOrWhiteSpace(lightModel) ? LightModelId : lightModel.Trim();

    private const int MaxFiles = 6;

    private const string SystemPrompt = """
        Eres el lector de reservas de una app de viajes personal. Recibes un billete, una tarjeta de embarque o un correo
        de confirmación (PDF, imagen o texto) y devuelves los datos de la reserva en el JSON pedido.

        Reglas:
        - Extrae solo lo que aparece en el documento. Si un dato no está, devuelve null. No inventes nada.
        - `type`: flight (vuelo), train (tren), hotel (alojamiento), car (alquiler de coche), ticket (entrada a evento, museo,
          espectáculo), other (cualquier otra cosa) o null si no es una reserva.
        - `title`: corto y útil para verlo en una lista. Vuelo: «IB 3170 MAD → LHR». Tren: «AVE 05143 Alicante → Madrid Chamartín».
          Hotel: el nombre del hotel. Coche: «Coche Hertz». Entrada: el nombre del evento.
        - `reference`: el localizador o código de reserva (PNR), no el número de billete ni el de cliente.
        - `startLocal` y `endLocal`: hora local del lugar en formato «AAAA-MM-DDTHH:mm», sin zona ni segundos. Para un vuelo o
          tren, salida y llegada; para un hotel, entrada y salida (si solo hay fecha, usa 00:00); para un coche, recogida y
          devolución; para una entrada, inicio y fin. Si el año no aparece, usa el año en curso o el siguiente si esa fecha
          ya pasó hace más de dos meses. Una llegada marcada «+1 día» es el día siguiente.
        - `startTz` y `endTz`: zona IANA del lugar de salida y de llegada («Europe/Madrid», «America/Argentina/Buenos_Aires»)
          cuando se deduzca del aeropuerto, estación o ciudad; si no, null.
        - `startPlace` y `endPlace`: aeropuerto (código IATA si aparece), estación, hotel o lugar. Para un hotel, el nombre.
        - `address`: dirección postal completa si aparece (hoteles, coches, eventos).
        - `notes`: lo que conviene tener a mano y no tiene campo propio, separado por « · »: pasajeros con asiento
          («Manuel Bernabe (23G)»), coche y plazas de tren, números de billete, terminal, puerta, clase, compañía operadora,
          teléfono de contacto. Nada de texto legal ni publicidad. En vuelos y trenes, el equipaje como tramo propio que
          empieza por «Equipaje: »: maletas facturadas con peso y si es por pasajero («Equipaje: 2 × 23 kg por pasajero ·
          …» o «Equipaje: 1 × 23 kg por pasajero, mano 10 kg»; «Equipaje: sin maleta facturada» si la tarifa no la incluye).
        - Textos en español, tal y como se escribirían en la app.
        """;

    public bool IsAvailable => true;

    public async Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct)
    {
        var content = new List<ContentBlockParam>();
        foreach (var file in input.Files.Take(MaxFiles))
        {
            if (file.Mime == "application/pdf")
            {
                content.Add(new DocumentBlockParam { Source = new Base64PdfSource { Data = Convert.ToBase64String(file.Bytes) } });
            }
            else if (file.Mime is "image/jpeg" or "image/png" or "image/gif" or "image/webp")
            {
                content.Add(new ImageBlockParam
                {
                    Source = new Base64ImageSource { Data = Convert.ToBase64String(file.Bytes), MediaType = file.Mime },
                });
            }
        }

        if (!string.IsNullOrWhiteSpace(input.Text))
        {
            content.Add(new TextBlockParam { Text = $"Texto del correo o documento:\n\n{input.Text}" });
        }

        if (content.Count == 0)
        {
            return null;
        }

        content.Add(new TextBlockParam { Text = "Devuelve los datos de la reserva en el JSON pedido." });

        try
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = Model,
                MaxTokens = 2000,
                System = new List<TextBlockParam> { new() { Text = SystemPrompt, CacheControl = new CacheControlEphemeral() } },
                OutputConfig = new OutputConfig { Effort = Effort.Medium, Format = new JsonOutputFormat { Schema = Schema() } },
                Messages = [new() { Role = Role.User, Content = content }],
            }, ct);

            if (response.StopReason == "refusal")
            {
                log.LogWarning("El modelo no quiso leer el documento ({Categoria}).", response.StopDetails?.Category);
                return null;
            }

            var json = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            var result = JsonSerializer.Deserialize<Extraction>(json, JsonOptions);
            log.LogInformation("Extracción con IA: tipo {Tipo}, localizador {Ref}, {Entrada} tokens de entrada, {Salida} de salida.",
                result?.Type ?? "ninguno", result?.Reference is null ? "no" : "sí", response.Usage.InputTokens, response.Usage.OutputTokens);
            return result is { Type: null, Title: null, Reference: null, StartLocal: null } ? null : result;
        }
        catch (AnthropicRateLimitException e)
        {
            log.LogWarning(e, "Extracción con IA: límite de peticiones.");
            return null;
        }
        catch (AnthropicApiException e)
        {
            log.LogWarning(e, "Extracción con IA: error de la API.");
            return null;
        }
        catch (JsonException e)
        {
            log.LogWarning(e, "Extracción con IA: la respuesta no era el JSON esperado.");
            return null;
        }
    }

    public Task<string?> AskJsonAsync(string system, string user, JsonElement schema, int maxTokens, CancellationToken ct) =>
        AskJsonWithFilesAsync(system, user, [], schema, maxTokens, ct);

    public async Task<string?> AskJsonWithFilesAsync(
        string system, string user, IReadOnlyList<ExtractionFile> files, JsonElement schema, int maxTokens, CancellationToken ct)
    {
        // Sin ficheros, el modelo ligero; si falla (no disponible en la cuenta, por ejemplo), el grande.
        if (files.Count == 0 && LightModel != Model)
        {
            try
            {
                return await AskAsync(LightModel, system, user, files, schema, maxTokens, ct);
            }
            catch (AnthropicApiException e) when (e is not AnthropicRateLimitException)
            {
                log.LogWarning(e, "Claude: el modelo ligero {Modelo} ha fallado; se usa {Grande}.", LightModel, Model);
            }
        }

        try
        {
            return await AskAsync(Model, system, user, files, schema, maxTokens, ct);
        }
        catch (AnthropicRateLimitException e)
        {
            log.LogWarning(e, "Claude: límite de peticiones.");
            return null;
        }
        catch (AnthropicApiException e)
        {
            log.LogWarning(e, "Claude: error de la API.");
            return null;
        }
    }

    private async Task<string?> AskAsync(
        string modelId, string system, string user, IReadOnlyList<ExtractionFile> files, JsonElement schema, int maxTokens, CancellationToken ct)
    {
        var content = new List<ContentBlockParam>();
        foreach (var file in files.Take(MaxFiles))
        {
            if (file.Mime == "application/pdf")
            {
                content.Add(new DocumentBlockParam { Source = new Base64PdfSource { Data = Convert.ToBase64String(file.Bytes) } });
            }
            else if (file.Mime is "image/jpeg" or "image/png" or "image/gif" or "image/webp")
            {
                content.Add(new ImageBlockParam { Source = new Base64ImageSource { Data = Convert.ToBase64String(file.Bytes), MediaType = file.Mime } });
            }
        }

        content.Add(new TextBlockParam { Text = user });
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = modelId,
                MaxTokens = maxTokens,
                System = new List<TextBlockParam> { new() { Text = system } },
                OutputConfig = new OutputConfig
                {
                    Effort = Effort.Low,
                    Format = new JsonOutputFormat { Schema = schema.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone()) },
                },
                Messages = [new() { Role = Role.User, Content = content }],
            }, ct);

            if (response.StopReason == "refusal")
            {
                log.LogWarning("El modelo no quiso responder ({Categoria}).", response.StopDetails?.Category);
                return null;
            }

            var json = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
            return string.IsNullOrWhiteSpace(json) ? null : json;
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    /// <summary>Todos los campos obligatorios y anulables: así el modelo no puede omitir ninguno ni añadir otros.</summary>
    private static Dictionary<string, JsonElement> Schema()
    {
        static object Nullable(params string[] enumValues) =>
            enumValues.Length == 0
                ? new { type = new[] { "string", "null" } }
                : new { type = new[] { "string", "null" }, @enum = enumValues.Append(null).ToArray() };

        var properties = new Dictionary<string, object>
        {
            ["type"] = Nullable("flight", "train", "hotel", "car", "ticket", "other"),
            ["title"] = Nullable(),
            ["reference"] = Nullable(),
            ["startLocal"] = Nullable(),
            ["startTz"] = Nullable(),
            ["startPlace"] = Nullable(),
            ["endLocal"] = Nullable(),
            ["endTz"] = Nullable(),
            ["endPlace"] = Nullable(),
            ["address"] = Nullable(),
            ["notes"] = Nullable(),
        };

        return new Dictionary<string, JsonElement>
        {
            ["type"] = JsonSerializer.SerializeToElement("object"),
            ["properties"] = JsonSerializer.SerializeToElement(properties),
            ["required"] = JsonSerializer.SerializeToElement(properties.Keys.ToArray()),
            ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
        };
    }
}
