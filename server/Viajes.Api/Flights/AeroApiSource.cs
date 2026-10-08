using System.Globalization;
using System.Net;
using System.Text.Json;

namespace Viajes.Api.Flights;

/// <summary>
/// FlightAware AeroAPI (nivel «Personal»: unos dólares gratis al mes). Consulta /flights/{ident} en una ventana de un día
/// alrededor de la salida.
/// </summary>
public sealed class AeroApiSource(HttpClient http, string apiKey) : IFlightStatusSource
{
    public string Name => "FlightAware";

    public async Task<FlightInfo?> GetAsync(string flightNumber, string date, string? origin, long departureUtcMs, CancellationToken ct)
    {
        var departure = DateTimeOffset.FromUnixTimeMilliseconds(departureUtcMs);
        var start = departure.AddHours(-14).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
        var end = departure.AddHours(14).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"https://aeroapi.flightaware.com/aeroapi/flights/{Uri.EscapeDataString(flightNumber)}?ident_type=designator&start={start}&end={end}");
        request.Headers.Add("x-apikey", apiKey);
        using var response = await http.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        return Parse(doc.RootElement, origin, departureUtcMs);
    }

    public static FlightInfo? Parse(JsonElement root, string? origin, long departureUtcMs)
    {
        if (!root.TryGetProperty("flights", out var list) || list.GetArrayLength() == 0)
        {
            return null;
        }

        var flights = list.EnumerateArray().ToList();
        var candidates = flights.Where(f => origin is null || string.Equals(Str(f, "origin", "code_iata"), origin, StringComparison.OrdinalIgnoreCase)).ToList();
        if (candidates.Count == 0)
        {
            candidates = flights;
        }

        var chosen = candidates.OrderBy(f => Math.Abs((Time(f, "scheduled_out") ?? Time(f, "scheduled_off") ?? long.MaxValue / 2) - departureUtcMs)).First();
        var info = new FlightInfo
        {
            Source = "FlightAware",
            Origin = Str(chosen, "origin", "code_iata"),
            Destination = Str(chosen, "destination", "code_iata"),
            DepScheduledMs = Time(chosen, "scheduled_out") ?? Time(chosen, "scheduled_off"),
            DepEstimatedMs = Time(chosen, "estimated_out") ?? Time(chosen, "estimated_off"),
            DepActualMs = Time(chosen, "actual_out") ?? Time(chosen, "actual_off"),
            DepTerminal = Str(chosen, "terminal_origin"),
            DepGate = Str(chosen, "gate_origin"),
            ArrScheduledMs = Time(chosen, "scheduled_in") ?? Time(chosen, "scheduled_on"),
            ArrEstimatedMs = Time(chosen, "estimated_in") ?? Time(chosen, "estimated_on"),
            ArrActualMs = Time(chosen, "actual_in") ?? Time(chosen, "actual_on"),
            ArrTerminal = Str(chosen, "terminal_destination"),
            ArrGate = Str(chosen, "gate_destination"),
            Baggage = Str(chosen, "baggage_claim"),
        };
        var status = Bool(chosen, "cancelled") ? "cancelled"
            : Bool(chosen, "diverted") ? "diverted"
            : info.ArrActualMs is not null ? "landed"
            : info.DepActualMs is not null ? "departed"
            : info.DelayMinutes >= 15 ? "delayed"
            : "scheduled";
        return info with { Status = status };
    }

    private static bool Bool(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;

    private static string? Str(JsonElement element, params string[] path)
    {
        foreach (var name in path)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out element))
            {
                return null;
            }
        }

        return element.ValueKind == JsonValueKind.String && element.GetString() is { Length: > 0 } text ? text.Trim() : null;
    }

    private static long? Time(JsonElement flight, string name)
    {
        var text = Str(flight, name);
        return text is not null && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value)
            ? value.ToUnixTimeMilliseconds()
            : null;
    }
}
