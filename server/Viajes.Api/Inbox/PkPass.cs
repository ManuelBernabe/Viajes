using System.IO.Compression;
using System.Text.Json;

namespace Viajes.Api.Inbox;

/// <summary>
/// Un pase de Apple Wallet es un zip con un <c>pass.json</c>: de ahí salen el texto del código de barras
/// (lo que hay que enseñar en el control) y la fecha relevante.
/// </summary>
public static class PkPass
{
    public sealed record Pass(string? BarcodeMessage, string? RelevantLocal, string? Description, Suggestion Suggestion);

    public static Pass? Read(byte[] bytes)
    {
        try
        {
            using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
            var entry = archive.GetEntry("pass.json");
            if (entry is null)
            {
                return null;
            }

            using var stream = entry.Open();
            using var document = JsonDocument.Parse(stream);
            var root = document.RootElement;

            string? message = null;
            if (root.TryGetProperty("barcodes", out var barcodes) && barcodes.ValueKind == JsonValueKind.Array && barcodes.GetArrayLength() > 0)
            {
                message = Text(barcodes[0], "message");
            }

            message ??= root.TryGetProperty("barcode", out var barcode) ? Text(barcode, "message") : null;

            var relevant = JsonLdReservations.Local(Text(root, "relevantDate"));
            var description = Text(root, "description");
            var suggestion = new Suggestion { Title = description, StartLocal = relevant };
            if (root.TryGetProperty("boardingPass", out var boardingPass))
            {
                suggestion.Type = Text(boardingPass, "transitType") switch
                {
                    "PKTransitTypeTrain" => "train",
                    "PKTransitTypeBus" => "other",
                    "PKTransitTypeBoat" => "other",
                    _ => "flight",
                };
                var fields = Fields(boardingPass);
                suggestion.StartPlace ??= fields.GetValueOrDefault("origin") ?? fields.GetValueOrDefault("from") ?? fields.GetValueOrDefault("depart");
                suggestion.EndPlace ??= fields.GetValueOrDefault("destination") ?? fields.GetValueOrDefault("to") ?? fields.GetValueOrDefault("arrive");
                suggestion.Reference ??= fields.GetValueOrDefault("pnr") ?? fields.GetValueOrDefault("reference") ?? fields.GetValueOrDefault("booking") ?? fields.GetValueOrDefault("confirmation");
                var flight = fields.GetValueOrDefault("flight") ?? fields.GetValueOrDefault("flightnumber") ?? fields.GetValueOrDefault("flight-number");
                if (flight is not null || suggestion.StartPlace is not null)
                {
                    suggestion.Title = string.Join(" ", new[] { flight, suggestion.StartPlace is null ? null : $"{suggestion.StartPlace} → {suggestion.EndPlace}" }.Where(p => p is not null));
                }
            }
            else if (root.TryGetProperty("eventTicket", out _))
            {
                suggestion.Type = "ticket";
            }

            return new Pass(message, relevant, description, suggestion);
        }
        catch (Exception e) when (e is InvalidDataException or JsonException or IOException)
        {
            return null;
        }
    }

    /// <summary>Todos los campos del pase, por clave en minúsculas → valor.</summary>
    private static Dictionary<string, string> Fields(JsonElement section)
    {
        var result = new Dictionary<string, string>();
        foreach (var group in new[] { "headerFields", "primaryFields", "secondaryFields", "auxiliaryFields", "backFields" })
        {
            if (!section.TryGetProperty(group, out var fields) || fields.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var field in fields.EnumerateArray())
            {
                var key = Text(field, "key")?.ToLowerInvariant();
                var value = Text(field, "value");
                if (key is not null && value is not null)
                {
                    result.TryAdd(key, value);
                }
            }
        }

        return result;
    }

    private static string? Text(JsonElement node, string name)
    {
        if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.ToString(),
            _ => null,
        };
    }
}
