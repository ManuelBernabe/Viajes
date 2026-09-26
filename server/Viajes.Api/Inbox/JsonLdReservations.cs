using System.Text.Json;
using System.Text.RegularExpressions;

namespace Viajes.Api.Inbox;

/// <summary>
/// Muchas confirmaciones (Iberia, Booking, Renfe…) llevan en el HTML un bloque schema.org en JSON-LD con la reserva
/// (es lo que usa Gmail para sus tarjetas). Se leen FlightReservation, LodgingReservation, TrainReservation,
/// RentalCarReservation y EventReservation. Solo se toman datos; nada del correo se ejecuta ni se interpreta.
/// </summary>
public static partial class JsonLdReservations
{
    public static Suggestion? Extract(string? html)
    {
        if (string.IsNullOrEmpty(html))
        {
            return null;
        }

        foreach (Match match in ScriptBlock().Matches(html))
        {
            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(match.Groups[1].Value.Trim());
            }
            catch (JsonException)
            {
                continue;
            }

            using (document)
            {
                var suggestion = FromNode(document.RootElement);
                if (suggestion is not null)
                {
                    return suggestion;
                }
            }
        }

        return null;
    }

    private static Suggestion? FromNode(JsonElement node)
    {
        switch (node.ValueKind)
        {
            case JsonValueKind.Array:
                foreach (var item in node.EnumerateArray())
                {
                    var found = FromNode(item);
                    if (found is not null)
                    {
                        return found;
                    }
                }

                return null;
            case JsonValueKind.Object:
                if (node.TryGetProperty("@graph", out var graph))
                {
                    return FromNode(graph);
                }

                return FromReservation(node);
            default:
                return null;
        }
    }

    private static Suggestion? FromReservation(JsonElement node)
    {
        var type = Text(node, "@type");
        var reservationFor = Prop(node, "reservationFor");
        var suggestion = new Suggestion { Reference = Text(node, "reservationNumber") };

        switch (type)
        {
            case "FlightReservation":
            {
                suggestion.Type = "flight";
                var flight = reservationFor;
                var carrier = Text(Prop(flight, "airline"), "iataCode") ?? Text(Prop(flight, "airline"), "name");
                var number = Text(flight, "flightNumber");
                var from = Text(Prop(flight, "departureAirport"), "iataCode") ?? Text(Prop(flight, "departureAirport"), "name");
                var to = Text(Prop(flight, "arrivalAirport"), "iataCode") ?? Text(Prop(flight, "arrivalAirport"), "name");
                suggestion.Title = Join(" ", Join(" ", carrier, number), Join(" → ", from, to));
                suggestion.StartLocal = Local(Text(flight, "departureTime"));
                suggestion.EndLocal = Local(Text(flight, "arrivalTime"));
                suggestion.StartPlace = from;
                suggestion.EndPlace = to;
                break;
            }

            case "LodgingReservation":
                suggestion.Type = "hotel";
                suggestion.Title = Text(reservationFor, "name");
                suggestion.StartLocal = Local(Text(node, "checkinTime") ?? Text(node, "checkinDate"));
                suggestion.EndLocal = Local(Text(node, "checkoutTime") ?? Text(node, "checkoutDate"));
                suggestion.Address = Address(Prop(reservationFor, "address"));
                suggestion.StartPlace = suggestion.Title;
                break;

            case "TrainReservation":
            {
                suggestion.Type = "train";
                var trip = reservationFor;
                var from = Text(Prop(trip, "departureStation"), "name");
                var to = Text(Prop(trip, "arrivalStation"), "name");
                suggestion.Title = Join(" ", Join(" ", Text(trip, "trainCompany") is { } company ? TextOf(Prop(trip, "trainCompany")) ?? company : null, Text(trip, "trainNumber")), Join(" → ", from, to));
                suggestion.StartLocal = Local(Text(trip, "departureTime"));
                suggestion.EndLocal = Local(Text(trip, "arrivalTime"));
                suggestion.StartPlace = from;
                suggestion.EndPlace = to;
                break;
            }

            case "RentalCarReservation":
                suggestion.Type = "car";
                suggestion.Title = Join(" ", "Coche", Text(reservationFor, "name") ?? Text(reservationFor, "model"));
                suggestion.StartLocal = Local(Text(node, "pickupTime"));
                suggestion.EndLocal = Local(Text(node, "dropoffTime"));
                suggestion.StartPlace = Text(Prop(node, "pickupLocation"), "name");
                suggestion.EndPlace = Text(Prop(node, "dropoffLocation"), "name");
                break;

            case "EventReservation":
                suggestion.Type = "ticket";
                suggestion.Title = Text(reservationFor, "name");
                suggestion.StartLocal = Local(Text(reservationFor, "startDate"));
                suggestion.EndLocal = Local(Text(reservationFor, "endDate"));
                suggestion.StartPlace = Text(Prop(reservationFor, "location"), "name");
                suggestion.Address = Address(Prop(Prop(reservationFor, "location"), "address"));
                break;

            default:
                return null;
        }

        return suggestion;
    }

    private static JsonElement? Prop(JsonElement? node, string name) =>
        node is { ValueKind: JsonValueKind.Object } element && element.TryGetProperty(name, out var value) ? value : null;

    private static string? Text(JsonElement? node, string name) => TextOf(Prop(node, name));

    private static string? TextOf(JsonElement? node) =>
        node switch
        {
            { ValueKind: JsonValueKind.String } element => Trimmed(element.GetString()),
            { ValueKind: JsonValueKind.Number } element => element.ToString(),
            { ValueKind: JsonValueKind.Object } element when element.TryGetProperty("name", out var inner) => TextOf(inner),
            _ => null,
        };

    private static string? Address(JsonElement? address)
    {
        if (address is null)
        {
            return null;
        }

        if (address is { ValueKind: JsonValueKind.String })
        {
            return TextOf(address);
        }

        return Join(", ",
            Text(address, "streetAddress"),
            Join(" ", Text(address, "postalCode"), Text(address, "addressLocality")),
            Text(address, "addressCountry"));
    }

    /// <summary>«2026-10-12T10:05:00+02:00» → «2026-10-12T10:05»: la hora local del lugar, que es la que se guarda.</summary>
    internal static string? Local(string? iso)
    {
        if (iso is null)
        {
            return null;
        }

        var match = IsoLocal().Match(iso);
        if (!match.Success)
        {
            return null;
        }

        return match.Groups[2].Success ? $"{match.Groups[1].Value}T{match.Groups[2].Value}" : $"{match.Groups[1].Value}T00:00";
    }

    private static string? Join(string separator, params string?[] parts)
    {
        var present = parts.Where(p => !string.IsNullOrWhiteSpace(p)).ToArray();
        return present.Length == 0 ? null : string.Join(separator, present);
    }

    private static string? Trimmed(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    [GeneratedRegex(@"<script[^>]*type\s*=\s*[""']application/ld\+json[""'][^>]*>(.*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ScriptBlock();

    [GeneratedRegex(@"^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?")]
    private static partial Regex IsoLocal();
}
