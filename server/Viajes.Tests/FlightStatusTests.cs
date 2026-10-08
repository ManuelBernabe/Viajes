using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Viajes.Api.Data;
using Viajes.Api.Flights;
using Viajes.Api.Push;

namespace Viajes.Tests;

/// <summary>Proveedor falso: devuelve lo que se le diga y cuenta las consultas.</summary>
public sealed class FakeFlights : IFlightStatusSource
{
    public FlightInfo? Next { get; set; }

    public List<string> Calls { get; } = [];

    public string Name => "Prueba";

    public Task<FlightInfo?> GetAsync(string flightNumber, string date, string? origin, long departureUtcMs, CancellationToken ct)
    {
        Calls.Add($"{flightNumber} {date} {origin}");
        return Task.FromResult(Next);
    }
}

public sealed class FlightApp : TestApp
{
    public FakeFlights Flights { get; } = new();

    public FakePushSender Sender { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IFlightStatusSource>();
            services.AddSingleton<IFlightStatusSource>(Flights);
            services.RemoveAll<IPushSender>();
            services.AddSingleton<IPushSender>(Sender);
        });
    }
}

public sealed class FlightStatusTests(FlightApp app) : IClassFixture<FlightApp>
{
    [Fact]
    public async Task One_lookup_serves_every_passenger_of_the_flight_and_announces_the_gate_once()
    {
        var api = await TripsApi.SignUp(app, "vuelos1@example.com");
        await api.Client.PostAsJsonAsync("/api/push/subscribe", new { endpoint = "https://push.example/vuelo", keys = new { p256dh = "p", auth = "a" } });
        var tripId = Guid.NewGuid();
        await api.PutTrip(tripId);
        var departure = DateTimeOffset.UtcNow.AddHours(3);
        var startLocal = departure.ToString("yyyy-MM-dd'T'HH:mm");
        var paco = Guid.NewGuid();
        var manuel = Guid.NewGuid();
        foreach (var (id, who) in new[] { (paco, "Paco"), (manuel, "Manuel") })
        {
            (await api.PutBooking(id, tripId, new { title = $"JA 3157 IGR → AEP · {who}", startLocal, startTz = "UTC", startPlace = "IGR", endLocal = (string?)null, endTz = (string?)null }))
                .EnsureSuccessStatusCode();
        }

        var scheduled = new DateTimeOffset(DateTime.ParseExact(startLocal, "yyyy-MM-dd'T'HH:mm", null), TimeSpan.Zero).ToUnixTimeMilliseconds();
        app.Flights.Next = new FlightInfo
        {
            Status = "delayed", Source = "Prueba", Origin = "IGR", Destination = "AEP", DepScheduledMs = scheduled, DepEstimatedMs = scheduled + 40 * 60_000,
            DepTerminal = "1", DepGate = "5",
        };

        var response = await api.Client.GetAsync($"/api/bookings/{paco}/flight-status?refresh=true");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("configured").GetBoolean());
        Assert.Equal("JA3157", body.GetProperty("flight").GetString());
        Assert.Equal(40, body.GetProperty("delayMinutes").GetInt32());
        Assert.Equal("5", body.GetProperty("info").GetProperty("depGate").GetString());
        Assert.Equal([$"JA3157 {startLocal[..10]} IGR"], app.Flights.Calls);

        // La otra reserva del mismo vuelo usa lo ya consultado: no se gasta otra consulta.
        var other = await (await api.Client.GetAsync($"/api/bookings/{manuel}/flight-status?refresh=true")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("delayed", other.GetProperty("info").GetProperty("status").GetString());
        Assert.Single(app.Flights.Calls);

        // Un solo aviso para la persona, aunque vea las dos reservas.
        var pushes = app.Sender.Sent.Where(s => s.Endpoint == "https://push.example/vuelo" && s.Message.Tag.StartsWith("flight-")).ToList();
        var push = Assert.Single(pushes);
        Assert.Equal("✈️ JA 3157 IGR → AEP · Paco", push.Message.Title);
        Assert.Contains("Retraso de 40 min", push.Message.Body);
        Assert.Contains("Puerta 5 · terminal 1", push.Message.Body);

        // Una reserva que no es un vuelo no tiene estado.
        var hotel = Guid.NewGuid();
        await api.PutBooking(hotel, tripId, new { title = "Hotel", type = "hotel" });
        Assert.Equal(HttpStatusCode.NotFound, (await api.Client.GetAsync($"/api/bookings/{hotel}/flight-status")).StatusCode);
    }
}

public sealed class FlightWatchRuleTests
{
    private const long H = 3_600_000;

    [Theory]
    [InlineData("JA 3157 IGR → AEP", "JA3157")]
    [InlineData("IB0317 MAD → JFK", "IB317")]
    [InlineData("G3 1234", "G31234")]
    [InlineData("U2 8091 · Paco", "U28091")]
    [InlineData("Vuelo a Tokio", null)]
    [InlineData("Iberia IB6845 Madrid → Río", "IB6845")]
    [InlineData("Vuelo de las 10:05 a Lima", null)]
    [InlineData("AVE 05143 Alicante → Madrid", null)]
    public void Flight_numbers_come_from_the_title(string title, string? expected) => Assert.Equal(expected, FlightWatch.FlightNumber(title));

    [Fact]
    public void The_flight_number_can_come_from_the_notes_or_the_airline_name()
    {
        Booking Flight(string title, string? notes) => new()
        {
            Id = Guid.NewGuid(), TripId = Guid.NewGuid(), Type = "flight", Title = title, Notes = notes, StartLocal = "2026-10-08T13:04", StartTz = "UTC", CreatedBy = "x",
        };
        Assert.Equal("LA8065", FlightWatch.FlightNumberOf(Flight("Vuelo a Lima", "Pasajero: Ana · Vuelo LA8065 · Asiento 12A")));
        Assert.Equal("JA3157", FlightWatch.FlightNumberOf(Flight("JetSMART Iguazú → Buenos Aires", "Pasajero: MANUEL · Vuelo: 3157 · Clase: P")));
        Assert.Null(FlightWatch.FlightNumberOf(Flight("Vuelo a Tokio", "Asiento 12A")));
        Assert.Equal("JA3157|2026-10-08", FlightWatch.KeyOf(Flight("JetSMART Iguazú → Buenos Aires", "Vuelo: 3157")));
    }

    [Fact]
    public void Lookups_get_closer_together_as_departure_nears_and_stop_when_it_lands()
    {
        var dep = 100 * H;
        Assert.Null(FlightWatch.Interval(dep, null, dep - 25 * H));
        Assert.Equal(6 * H, FlightWatch.Interval(dep, null, dep - 20 * H));
        Assert.Equal(H / 2, FlightWatch.Interval(dep, null, dep - 3 * H));
        Assert.Equal(H / 4, FlightWatch.Interval(dep, null, dep - H / 2));
        Assert.Equal(H / 2, FlightWatch.Interval(dep, new FlightInfo { Status = "departed", ArrScheduledMs = dep + 2 * H }, dep + H));
        Assert.Null(FlightWatch.Interval(dep, new FlightInfo { Status = "landed" }, dep + 3 * H));
        Assert.Null(FlightWatch.Interval(dep, new FlightInfo { Status = "departed", ArrScheduledMs = dep + 2 * H }, dep + 5 * H));

        Assert.True(FlightWatch.IsDue(dep, null, null, dep - 3 * H));
        Assert.False(FlightWatch.IsDue(dep, null, dep - 3 * H - 10 * 60_000, dep - 3 * H));
    }

    [Fact]
    public void Only_changes_that_matter_are_announced()
    {
        var dep = new DateTimeOffset(2026, 10, 8, 11, 49, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();
        var onTime = new FlightInfo { Status = "scheduled", DepScheduledMs = dep, DepEstimatedMs = dep, DepGate = "5" };
        const string tz = "America/Argentina/Buenos_Aires";

        Assert.Empty(FlightWatch.Changes(onTime, onTime with { DepEstimatedMs = dep + 10 * 60_000 }, tz));
        Assert.Equal(["🕒 Retraso de 1 h 05 min: sale a las 09:54"], FlightWatch.Changes(onTime, onTime with { DepEstimatedMs = dep + 65 * 60_000 }, tz));
        Assert.Equal(["🟢 Vuelve a ir en hora: sale a las 08:49"], FlightWatch.Changes(onTime with { DepEstimatedMs = dep + 65 * 60_000 }, onTime, tz));
        Assert.Equal(["🚪 Cambio de puerta: 5 → 7"], FlightWatch.Changes(onTime, onTime with { DepGate = "7" }, tz));
        Assert.Equal(["❌ Vuelo cancelado. Revisa el correo de la aerolínea."], FlightWatch.Changes(onTime, onTime with { Status = "cancelled", DepGate = "9" }, tz));
        Assert.Equal(["🧳 Equipaje en la cinta 3"], FlightWatch.Changes(onTime with { Status = "departed", DepActualMs = dep }, onTime with { Status = "landed", DepActualMs = dep, Baggage = "3" }, tz));
    }

    [Fact]
    public void AeroDataBox_answers_are_read_and_the_leg_from_the_booking_origin_is_chosen()
    {
        var json = JsonDocument.Parse("""
            [
              {"number":"JA 3157","status":"Expected",
               "departure":{"airport":{"iata":"MDZ"},"scheduledTime":{"utc":"2026-10-08 06:00Z","local":"2026-10-08 03:00-03:00"}},
               "arrival":{"airport":{"iata":"IGR"}}},
              {"number":"JA 3157","status":"Delayed",
               "departure":{"airport":{"iata":"IGR"},"scheduledTime":{"utc":"2026-10-08 11:49Z","local":"2026-10-08 08:49-03:00"},
                 "revisedTime":{"utc":"2026-10-08 12:29Z","local":"2026-10-08 09:29-03:00"},"terminal":"A","gate":"3","checkInDesk":"10-14"},
               "arrival":{"airport":{"iata":"AEP"},"scheduledTime":{"utc":"2026-10-08 13:40Z","local":"2026-10-08 10:40-03:00"},"baggageBelt":"4"}}
            ]
            """).RootElement;
        var info = AeroDataBoxSource.Parse(json, "IGR", 0)!;
        Assert.Equal("delayed", info.Status);
        Assert.Equal(40, info.DelayMinutes);
        Assert.Equal(("A", "3", "10-14", "4", "AEP"), (info.DepTerminal, info.DepGate, info.CheckInDesk, info.Baggage, info.Destination));
        Assert.Null(AeroDataBoxSource.Parse(JsonDocument.Parse("[]").RootElement, null, 0));
    }

    [Fact]
    public void FlightAware_answers_are_read()
    {
        var json = JsonDocument.Parse("""
            {"flights":[{"ident_iata":"JA3157","cancelled":false,"diverted":false,
              "origin":{"code_iata":"IGR"},"destination":{"code_iata":"AEP"},
              "scheduled_out":"2026-10-08T11:49:00Z","estimated_out":"2026-10-08T11:49:00Z","actual_out":"2026-10-08T11:52:00Z",
              "scheduled_in":"2026-10-08T13:40:00Z","estimated_in":"2026-10-08T13:35:00Z",
              "gate_origin":"3","terminal_origin":null,"gate_destination":"12","terminal_destination":"A","baggage_claim":null}]}
            """).RootElement;
        var info = AeroApiSource.Parse(json, "IGR", 0)!;
        Assert.Equal("departed", info.Status);
        Assert.Equal("3", info.DepGate);
        Assert.Equal("12", info.ArrGate);
        Assert.Equal(new DateTimeOffset(2026, 10, 8, 13, 35, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), info.ArrivalMs);
    }
}
