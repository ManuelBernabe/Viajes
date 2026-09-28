using System.Text;
using System.Text.Json;

namespace Viajes.Api.Ai;

/// <summary>
/// Lee billetes y confirmaciones con Gemini (API «interactions»; modelo Flash, con nivel gratuito). Acepta PDF e
/// imágenes tal cual y devuelve JSON validado contra un esquema. Se pide «store: false» para que Google no guarde
/// la interacción en su servidor.
/// </summary>
public sealed class GeminiBookingExtractor(HttpClient http, ILogger<GeminiBookingExtractor> log, string? preferredModel = null) : IBookingExtractor
{
    public const string ModelId = "gemini-3.8-flash";

    /// <summary>Si un modelo está saturado (503/429), se prueba el siguiente; todos tienen nivel gratuito.</summary>
    private static readonly string[] FallbackModels = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

    private const int MaxFiles = 6;

    private const string SystemInstruction = """
        Eres el lector de reservas de una app de viajes personal. Recibes un billete, una tarjeta de embarque o un correo
        de confirmación (PDF, imagen o texto) y devuelves los datos de la reserva en el JSON pedido.

        Reglas:
        - Extrae solo lo que aparece en el documento. Si un dato no está, devuelve null. No inventes nada.
        - type: flight (vuelo), train (tren), hotel (alojamiento), car (alquiler de coche), ticket (entrada a evento, museo,
          espectáculo), other (cualquier otra cosa) o null si no es una reserva.
        - title: corto y útil en una lista. Vuelo: «IB 3170 MAD → LHR». Tren: «AVE 05143 Alicante → Madrid Chamartín».
          Hotel: el nombre del hotel. Coche: «Coche Hertz». Entrada: el nombre del evento.
        - reference: el localizador o código de reserva (PNR), no el número de billete ni el de cliente.
        - startLocal y endLocal: hora local del lugar, formato «AAAA-MM-DDTHH:mm», sin zona ni segundos. Vuelo o tren: salida
          y llegada; hotel: entrada y salida (si solo hay fecha, 00:00); coche: recogida y devolución; entrada: inicio y fin.
          Si no aparece el año, usa el año en curso o el siguiente si esa fecha ya pasó hace más de dos meses. «+1 día» en
          una llegada significa el día siguiente.
        - startTz y endTz: zona IANA del lugar de salida y de llegada («Europe/Madrid», «America/Argentina/Buenos_Aires»)
          cuando se deduzca del aeropuerto, estación o ciudad; si no, null.
        - startPlace y endPlace: aeropuerto (código IATA si aparece), estación, hotel o lugar. Para un hotel, su nombre.
        - address: dirección postal completa si aparece.
        - notes: lo útil sin campo propio, separado por « · »: pasajeros con asiento, coche y plazas de tren, números de
          billete, terminal, puerta, clase, compañía operadora, teléfono. Nada de texto legal ni publicidad.
        - Textos en español, tal y como se escribirían en la app.
        """;

    public bool IsAvailable => true;

    public async Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct)
    {
        var parts = new List<object>();
        foreach (var file in input.Files.Take(MaxFiles))
        {
            if (file.Mime == "application/pdf")
            {
                parts.Add(new { type = "document", data = Convert.ToBase64String(file.Bytes), mime_type = "application/pdf" });
            }
            else if (file.Mime is "image/jpeg" or "image/png" or "image/webp" or "image/heic" or "image/heif")
            {
                parts.Add(new { type = "image", data = Convert.ToBase64String(file.Bytes), mime_type = file.Mime });
            }
        }

        if (!string.IsNullOrWhiteSpace(input.Text))
        {
            parts.Add(new { type = "text", text = $"Texto del correo o documento:\n\n{input.Text.Trim()}" });
        }

        if (parts.Count == 0)
        {
            return null;
        }

        parts.Add(new { type = "text", text = "Devuelve los datos de la reserva en el JSON pedido." });

        var models = FallbackModels.Prepend(preferredModel ?? ModelId).Distinct().ToList();
        try
        {
            foreach (var model in models)
            {
                var body = new
                {
                    model,
                    system_instruction = SystemInstruction,
                    input = parts,
                    generation_config = new { temperature = 0, max_output_tokens = 1500 },
                    response_format = new { type = "text", mime_type = "application/json", schema = Schema },
                    store = false,
                };
                using var request = new HttpRequestMessage(HttpMethod.Post, "v1beta/interactions")
                {
                    Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
                };
                using var response = await http.SendAsync(request, ct);
                var payload = await response.Content.ReadAsStringAsync(ct);
                if ((int)response.StatusCode is 503 or 429)
                {
                    log.LogWarning("Gemini ({Modelo}) saturado ({Codigo}); se prueba el siguiente modelo.", model, (int)response.StatusCode);
                    continue;
                }

                if (!response.IsSuccessStatusCode)
                {
                    log.LogWarning("Gemini ({Modelo}) respondió {Codigo}: {Cuerpo}", model, (int)response.StatusCode, payload.Length > 400 ? payload[..400] : payload);
                    return null;
                }

                var text = OutputText(payload);
                if (string.IsNullOrWhiteSpace(text))
                {
                    log.LogWarning("Gemini ({Modelo}) no devolvió texto: {Cuerpo}", model, payload.Length > 400 ? payload[..400] : payload);
                    return null;
                }

                var result = JsonSerializer.Deserialize<Extraction>(text, JsonOptions);
                log.LogInformation("Extracción con Gemini ({Modelo}): tipo {Tipo}, localizador {Ref}.", model, result?.Type ?? "ninguno", result?.Reference is null ? "no" : "sí");
                return result is null or { Type: null, Title: null, Reference: null, StartLocal: null } ? null : result;
            }

            log.LogWarning("Gemini: todos los modelos saturados ({Modelos}).", string.Join(", ", models));
            return null;
        }
        catch (HttpRequestException e)
        {
            log.LogWarning(e, "Gemini: error de red.");
            return null;
        }
        catch (TaskCanceledException e) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(e, "Gemini: tiempo de espera agotado.");
            return null;
        }
        catch (JsonException e)
        {
            log.LogWarning(e, "Gemini: la respuesta no era el JSON esperado.");
            return null;
        }
    }

    /// <summary>«output_text» si viene; si no, el último bloque de texto que haya en los pasos de la respuesta.</summary>
    public static string? OutputText(string payload)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        if (root.TryGetProperty("output_text", out var direct) && direct.ValueKind == JsonValueKind.String)
        {
            return direct.GetString();
        }

        string? last = null;
        void Walk(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.Object:
                    if (element.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "text"
                        && element.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                    {
                        last = text.GetString();
                    }

                    foreach (var property in element.EnumerateObject())
                    {
                        Walk(property.Value);
                    }

                    break;
                case JsonValueKind.Array:
                    foreach (var item in element.EnumerateArray())
                    {
                        Walk(item);
                    }

                    break;
            }
        }

        Walk(root);
        return last;
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private static readonly object Schema = new
    {
        type = "object",
        properties = new Dictionary<string, object>
        {
            ["type"] = new { type = new[] { "string", "null" }, @enum = new[] { "flight", "train", "hotel", "car", "ticket", "other" } },
            ["title"] = new { type = new[] { "string", "null" } },
            ["reference"] = new { type = new[] { "string", "null" } },
            ["startLocal"] = new { type = new[] { "string", "null" } },
            ["startTz"] = new { type = new[] { "string", "null" } },
            ["startPlace"] = new { type = new[] { "string", "null" } },
            ["endLocal"] = new { type = new[] { "string", "null" } },
            ["endTz"] = new { type = new[] { "string", "null" } },
            ["endPlace"] = new { type = new[] { "string", "null" } },
            ["address"] = new { type = new[] { "string", "null" } },
            ["notes"] = new { type = new[] { "string", "null" } },
        },
        required = new[] { "type", "title", "reference", "startLocal", "startTz", "startPlace", "endLocal", "endTz", "endPlace", "address", "notes" },
    };

    public static HttpClient CreateClient(string apiKey)
    {
        var client = new HttpClient { BaseAddress = new Uri("https://generativelanguage.googleapis.com/"), Timeout = TimeSpan.FromSeconds(90) };
        client.DefaultRequestHeaders.Add("x-goog-api-key", apiKey);
        return client;
    }
}
