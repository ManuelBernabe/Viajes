using System.Globalization;
using System.Net;
using System.Text.Json;

namespace Viajes.Api.Flights;

/// <summary>
/// AeroDataBox (vía RapidAPI): «Flight status» por número y día local. El plan gratuito da unas pocas centenas de
/// consultas al mes; por eso el servidor consulta poco y comparte el resultado entre reservas del mismo vuelo.
/// </summary>
public sealed class AeroDataBoxSource(HttpClient http, string apiKey) : IFlightStatusSource
{
    public const string Host = "aerodatabox.p.rapidapi.com";

    public string Name => "AeroDataBox";

    public async Task<FlightInfo?> GetAsync(string flightNumber, string date, string? origin, long departureUtcMs, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"https://{Host}/flights/number/{Uri.EscapeDataString(flightNumber)}/{date}?withAircraftImage=false&withLocation=false&dateLocalRole=Departure");
        request.Headers.Add("X-RapidAPI-Key", apiKey);
        request.Headers.Add("X-RapidAPI-Host", Host);
        using var response = await http.SendAsync(request, ct);
        if (response.StatusCode is HttpStatusCode.NoContent or HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        return Parse(doc.RootElement, origin, departureUtcMs);
    }

    public static FlightInfo? Parse(JsonElement root, string? origin, long departureUtcMs)
    {
        if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
        {
            return null;
        }

        var flights = root.EnumerateArray().ToList();
        var chosen = flights.FirstOrDefault(f => origin is not null && string.Equals(Str(f, "departure", "airport", "iata"), origin, StringComparison.OrdinalIgnoreCase));
        if (chosen.ValueKind == JsonValueKind.Undefined)
        {
            chosen = flights.OrderBy(f => Math.Abs((Time(f, "departure", "scheduledTime") ?? long.MaxValue / 2) - departureUtcMs)).First();
        }

        var status = Str(chosen, "status") ?? "Unknown";
        var info = new FlightInfo
        {
            Source = "AeroDataBox",
            Origin = Str(chosen, "departure", "airport", "iata"),
            Destination = Str(chosen, "arrival", "airport", "iata"),
            DepScheduledMs = Time(chosen, "departure", "scheduledTime"),
            DepEstimatedMs = Time(chosen, "departure", "revisedTime") ?? Time(chosen, "departure", "predictedTime"),
            DepActualMs = Time(chosen, "departure", "runwayTime"),
            DepTerminal = Str(chosen, "departure", "terminal"),
            DepGate = Str(chosen, "departure", "gate"),
            CheckInDesk = Str(chosen, "departure", "checkInDesk"),
            ArrScheduledMs = Time(chosen, "arrival", "scheduledTime"),
            ArrEstimatedMs = Time(chosen, "arrival", "revisedTime") ?? Time(chosen, "arrival", "predictedTime"),
            ArrActualMs = Time(chosen, "arrival", "runwayTime"),
            ArrTerminal = Str(chosen, "arrival", "terminal"),
            ArrGate = Str(chosen, "arrival", "gate"),
            Baggage = Str(chosen, "arrival", "baggageBelt"),
        };
        return info with { Status = Normalize(status, info) };
    }

    private static string Normalize(string status, FlightInfo info) => status switch
    {
        "Canceled" or "CanceledUncertain" => "cancelled",
        "Diverted" => "diverted",
        "Arrived" => "landed",
        "Departed" or "EnRoute" or "Approaching" => "departed",
        "Boarding" or "GateClosed" => "boarding",
        "Delayed" => "delayed",
        _ => info.DelayMinutes >= 15 ? "delayed" : status == "Unknown" ? "unknown" : "scheduled",
    };

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

    /// <summary>«2026-10-08 11:49Z» (o con segundos) → ms UTC.</summary>
    private static long? Time(JsonElement flight, string side, string name)
    {
        var text = Str(flight, side, name, "utc");
        return text is not null && DateTimeOffset.TryParse(text.Replace(' ', 'T'), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value)
            ? value.ToUnixTimeMilliseconds()
            : null;
    }
}
