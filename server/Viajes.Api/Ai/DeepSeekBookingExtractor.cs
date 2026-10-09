using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using UglyToad.PdfPig;

namespace Viajes.Api.Ai;

/// <summary>
/// Lee billetes y confirmaciones con DeepSeek (API compatible con OpenAI, modelo «deepseek-flash»: texto e imágenes,
/// sin PDF). Los PDF se convierten a texto antes de enviarlos; la salida se fuerza a JSON y se valida aquí.
/// </summary>
public sealed class DeepSeekBookingExtractor(HttpClient http, ILogger<DeepSeekBookingExtractor> log) : IBookingExtractor, IJsonAsker
{
    public const string ModelId = "deepseek-flash";

    private const int MaxImages = 6;
    private const int MaxTextChars = 40_000;

    private const string SystemPrompt = """
        Eres el lector de reservas de una app de viajes personal. Recibes un billete, una tarjeta de embarque o un correo
        de confirmación (texto o imágenes) y respondes SOLO con un objeto JSON con estas claves, todas obligatorias y con
        valor null cuando el dato no aparece:

        {"type": "flight", "title": "IB 3170 MAD → LHR", "reference": "XK7P2Q", "startLocal": "2026-10-12T10:05",
         "startTz": "Europe/Madrid", "startPlace": "MAD", "endLocal": "2026-10-12T11:35", "endTz": "Europe/London",
         "endPlace": "LHR", "address": null, "notes": "Pasajero: Manuel Bernabe (12A) · Billete 0751234567890 · Terminal 4"}

        Reglas:
        - Extrae solo lo que aparece en el documento. Si un dato no está, pon null. No inventes nada.
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
          billete, terminal, puerta, clase, compañía operadora, teléfono. Nada de texto legal ni publicidad. En vuelos y
          trenes, el equipaje como tramo propio: «Equipaje: 2 × 23 kg por pasajero» (con mano si lo dice), o «Equipaje: sin
          maleta facturada» si la tarifa no la incluye.
        - Textos en español. Responde únicamente con el JSON, sin explicaciones ni marcas de código.
        """;

    public bool IsAvailable => true;

    public async Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct)
    {
        var parts = new List<object>();
        var text = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(input.Text))
        {
            text.AppendLine("Texto del correo o documento:").AppendLine().AppendLine(input.Text.Trim());
        }

        var images = 0;
        foreach (var file in input.Files)
        {
            if (file.Mime == "application/pdf")
            {
                var pdfText = PdfText(file.Bytes, file.Name);
                if (pdfText.Length > 0)
                {
                    text.AppendLine().AppendLine($"Texto del PDF «{file.Name}»:").AppendLine().AppendLine(pdfText);
                }
            }
            else if (file.Mime is "image/jpeg" or "image/png" or "image/gif" or "image/webp" && images < MaxImages)
            {
                images++;
                parts.Add(new { type = "image_url", image_url = new { url = $"data:{file.Mime};base64,{Convert.ToBase64String(file.Bytes)}" } });
            }
        }

        var prompt = text.Length > 0 ? text.ToString() : "";
        if (prompt.Length > MaxTextChars)
        {
            prompt = prompt[..MaxTextChars];
        }

        if (prompt.Length == 0 && images == 0)
        {
            return null;
        }

        parts.Add(new { type = "text", text = $"{prompt}\n\nDevuelve los datos de la reserva como JSON con las claves indicadas." });

        var body = new
        {
            model = ModelId,
            messages = new object[]
            {
                new { role = "system", content = SystemPrompt },
                new { role = "user", content = parts },
            },
            response_format = new { type = "json_object" },
            max_tokens = 1500,
            temperature = 0,
        };

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            };
            using var response = await http.SendAsync(request, ct);
            var payload = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                log.LogWarning("DeepSeek respondió {Codigo}: {Cuerpo}", (int)response.StatusCode, payload.Length > 300 ? payload[..300] : payload);
                return null;
            }

            var completion = JsonSerializer.Deserialize<Completion>(payload, JsonOptions);
            var content = completion?.Choices?.FirstOrDefault()?.Message?.Content;
            if (string.IsNullOrWhiteSpace(content))
            {
                return null;
            }

            var result = JsonSerializer.Deserialize<Extraction>(StripFences(content), JsonOptions);
            log.LogInformation("Extracción con DeepSeek: tipo {Tipo}, localizador {Ref}, {Entrada} tokens de entrada, {Salida} de salida.",
                result?.Type ?? "ninguno", result?.Reference is null ? "no" : "sí", completion?.Usage?.PromptTokens, completion?.Usage?.CompletionTokens);
            return result is null or { Type: null, Title: null, Reference: null, StartLocal: null } ? null : result;
        }
        catch (HttpRequestException e)
        {
            log.LogWarning(e, "DeepSeek: error de red.");
            return null;
        }
        catch (TaskCanceledException e) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(e, "DeepSeek: tiempo de espera agotado.");
            return null;
        }
        catch (JsonException e)
        {
            log.LogWarning(e, "DeepSeek: la respuesta no era el JSON esperado.");
            return null;
        }
    }

    public Task<string?> AskJsonAsync(string system, string user, JsonElement schema, int maxTokens, CancellationToken ct) =>
        AskJsonWithFilesAsync(system, user, [], schema, maxTokens, ct);

    public async Task<string?> AskJsonWithFilesAsync(
        string system, string user, IReadOnlyList<ExtractionFile> files, JsonElement schema, int maxTokens, CancellationToken ct)
    {
        // Las imágenes van como partes del mensaje; de un PDF, su texto.
        object userContent = user;
        if (files.Count > 0)
        {
            var parts = new List<object>();
            var text = new StringBuilder(user);
            foreach (var file in files)
            {
                if (file.Mime == "application/pdf")
                {
                    text.AppendLine().AppendLine($"Texto del PDF «{file.Name}»:").AppendLine(PdfText(file.Bytes, file.Name));
                }
                else if (file.Mime is "image/jpeg" or "image/png" or "image/gif" or "image/webp" && parts.Count < MaxImages)
                {
                    parts.Add(new { type = "image_url", image_url = new { url = $"data:{file.Mime};base64,{Convert.ToBase64String(file.Bytes)}" } });
                }
            }

            parts.Add(new { type = "text", text = text.ToString() });
            userContent = parts;
        }

        // DeepSeek no valida contra un esquema: se le enseña en el propio mensaje.
        var body = new
        {
            model = ModelId,
            messages = new object[]
            {
                new { role = "system", content = $"{system}\n\nResponde únicamente con un objeto JSON que cumpla este esquema, sin explicaciones ni marcas de código:\n{schema.GetRawText()}" },
                new { role = "user", content = userContent },
            },
            response_format = new { type = "json_object" },
            max_tokens = maxTokens,
            temperature = 0.4,
        };

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            };
            using var response = await http.SendAsync(request, ct);
            var payload = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                log.LogWarning("DeepSeek respondió {Codigo}: {Cuerpo}", (int)response.StatusCode, payload.Length > 300 ? payload[..300] : payload);
                return null;
            }

            var content = JsonSerializer.Deserialize<Completion>(payload, JsonOptions)?.Choices?.FirstOrDefault()?.Message?.Content;
            return string.IsNullOrWhiteSpace(content) ? null : StripFences(content);
        }
        catch (HttpRequestException e)
        {
            log.LogWarning(e, "DeepSeek: error de red.");
            return null;
        }
        catch (TaskCanceledException e) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(e, "DeepSeek: tiempo de espera agotado.");
            return null;
        }
        catch (JsonException e)
        {
            log.LogWarning(e, "DeepSeek: la respuesta no era el JSON esperado.");
            return null;
        }
    }

    /// <summary>Texto de las tres primeras páginas del PDF; vacío si el PDF es solo imagen o no se puede abrir.</summary>
    private string PdfText(byte[] bytes, string name)
    {
        try
        {
            using var document = PdfDocument.Open(bytes);
            var text = new StringBuilder();
            foreach (var page in document.GetPages().Take(3))
            {
                text.AppendLine(page.Text);
            }

            return text.ToString().Trim();
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            log.LogWarning(e, "No se pudo leer el texto del PDF «{Nombre}».", name);
            return "";
        }
    }

    private static string StripFences(string content)
    {
        var trimmed = content.Trim();
        if (trimmed.StartsWith("```"))
        {
            var start = trimmed.IndexOf('\n');
            var end = trimmed.LastIndexOf("```", StringComparison.Ordinal);
            if (start >= 0 && end > start)
            {
                trimmed = trimmed[(start + 1)..end].Trim();
            }
        }

        return trimmed;
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private sealed record Completion(List<Choice>? Choices, Usage? Usage);

    private sealed record Choice(ChoiceMessage? Message);

    private sealed record ChoiceMessage(string? Content);

    private sealed record Usage([property: JsonPropertyName("prompt_tokens")] int PromptTokens, [property: JsonPropertyName("completion_tokens")] int CompletionTokens);

    public static HttpClient CreateClient(string apiKey)
    {
        var client = new HttpClient { BaseAddress = new Uri("https://api.deepseek.com/"), Timeout = TimeSpan.FromSeconds(90) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        return client;
    }
}
