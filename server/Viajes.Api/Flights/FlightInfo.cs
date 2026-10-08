namespace Viajes.Api.Flights;

/// <summary>
/// Lo que se sabe de un vuelo en un momento, igual venga del proveedor que venga. Horas en milisegundos UTC.
/// Status: scheduled (programado), delayed (con retraso), boarding (embarcando), departed (ha salido), landed (ha
/// aterrizado), cancelled, diverted (desviado) o unknown.
/// </summary>
public sealed record FlightInfo
{
    public string Status { get; init; } = "unknown";

    public string? Origin { get; init; }

    public string? Destination { get; init; }

    public long? DepScheduledMs { get; init; }

    public long? DepEstimatedMs { get; init; }

    public long? DepActualMs { get; init; }

    public string? DepTerminal { get; init; }

    public string? DepGate { get; init; }

    public string? CheckInDesk { get; init; }

    public long? ArrScheduledMs { get; init; }

    public long? ArrEstimatedMs { get; init; }

    public long? ArrActualMs { get; init; }

    public string? ArrTerminal { get; init; }

    public string? ArrGate { get; init; }

    public string? Baggage { get; init; }

    /// <summary>«AeroDataBox» o «FlightAware»: se enseña como fuente.</summary>
    public string Source { get; init; } = "";

    public static readonly IReadOnlySet<string> Final = new HashSet<string> { "landed", "cancelled", "diverted" };

    /// <summary>Minutos de retraso en la salida (lo real o lo previsto frente a lo programado); 0 si va en hora o no se sabe.</summary>
    public int DelayMinutes =>
        DepScheduledMs is { } scheduled && (DepActualMs ?? DepEstimatedMs) is { } expected
            ? (int)Math.Max(0, Math.Round((expected - scheduled) / 60_000.0))
            : 0;

    /// <summary>Lo que se espera a la llegada (real, prevista o programada).</summary>
    public long? ArrivalMs => ArrActualMs ?? ArrEstimatedMs ?? ArrScheduledMs;
}

/// <summary>Quien sabe el estado de los vuelos. Sin clave configurada, no hay ninguno.</summary>
public interface IFlightStatusSource
{
    string Name { get; }

    /// <summary>Si hay clave con la que consultar.</summary>
    bool IsConfigured => true;

    /// <summary>
    /// El vuelo «JA3157» que sale el día local <paramref name="date"/>; si hay varios (escalas), el que sale de
    /// <paramref name="origin"/> o el más cercano a <paramref name="departureUtcMs"/>. Null si el proveedor no lo conoce.
    /// </summary>
    Task<FlightInfo?> GetAsync(string flightNumber, string date, string? origin, long departureUtcMs, CancellationToken ct);
}
