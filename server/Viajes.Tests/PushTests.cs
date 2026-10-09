using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Viajes.Api.Data;
using Viajes.Api.Push;
using Viajes.Api.Trips;

namespace Viajes.Tests;

/// <summary>Emisor falso: recuerda lo enviado y puede fingir que un dispositivo ya no existe.</summary>
public sealed class FakePushSender : IPushSender
{
    public List<(string Endpoint, PushMessage Message)> Sent { get; } = [];

    public HashSet<string> GoneEndpoints { get; } = [];

    public bool IsConfigured => true;

    public string? PublicKey => "BPUBLICKEY";

    public Task<PushResult> SendAsync(PushSubscription subscription, PushMessage message, CancellationToken ct)
    {
        if (GoneEndpoints.Contains(subscription.Endpoint))
        {
            return Task.FromResult(PushResult.Gone);
        }

        Sent.Add((subscription.Endpoint, message));
        return Task.FromResult(PushResult.Sent);
    }
}

public sealed class PushApp : TestApp
{
    public FakePushSender Sender { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IPushSender>();
            services.AddSingleton<IPushSender>(Sender);
        });
    }
}

public sealed class PushTests(PushApp app) : IClassFixture<PushApp>
{
    private static object Subscription(string endpoint) => new { endpoint, keys = new { p256dh = "p256", auth = "auth" } };

    [Fact]
    public async Task The_public_key_is_served_to_signed_in_users_only()
    {
        var anonymous = app.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/push/public-key")).StatusCode);

        var api = await TripsApi.SignUp(app, "push-clave@example.com");
        var key = await api.Client.GetFromJsonAsync<Dictionary<string, string>>("/api/push/public-key");
        Assert.Equal("BPUBLICKEY", key!["publicKey"]);
    }

    [Fact]
    public async Task A_test_notification_reaches_every_device_of_the_user()
    {
        var api = await TripsApi.SignUp(app, "push-prueba@example.com");
        Assert.Equal(HttpStatusCode.NoContent, (await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/prueba-1"))).StatusCode);
        await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/prueba-2"));
        await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/prueba-2"));

        var result = await api.Client.PostAsJsonAsync("/api/push/test", new { });
        var sent = (await result.Content.ReadFromJsonAsync<Dictionary<string, int>>())!["sent"];

        Assert.Equal(2, sent);
        Assert.Equal(2, app.Sender.Sent.Count(s => s.Endpoint.Contains("prueba-")));
        var status = await api.Client.GetFromJsonAsync<Dictionary<string, object>>("/api/push/status");
        Assert.Equal("2", status!["devices"].ToString());
    }

    [Fact]
    public async Task A_new_change_note_notifies_the_household_and_dead_devices_are_dropped()
    {
        var api = await TripsApi.SignUp(app, "push-cambio@example.com");
        await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/cambio-vivo"));
        await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/cambio-muerto"));
        app.Sender.GoneEndpoints.Add("https://push.example/cambio-muerto");
        var tripId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        await api.PutTrip(tripId);
        await api.PutBooking(bookingId, tripId);
        Assert.DoesNotContain(app.Sender.Sent, s => s.Message.Tag == $"change-{bookingId}");

        await api.PutBooking(bookingId, tripId, new { changeNote = "Modificada: salida 10:05 → 12:40" });
        await api.PutBooking(bookingId, tripId, new { changeNote = "Modificada: salida 10:05 → 12:40" });

        var changes = app.Sender.Sent.Where(s => s.Message.Tag == $"change-{bookingId}").ToList();
        Assert.Single(changes);
        Assert.Equal("https://push.example/cambio-vivo", changes[0].Endpoint);
        Assert.Equal("Reserva modificada: Vuelo a Tokio", changes[0].Message.Title);
        Assert.Contains("10:05 → 12:40", changes[0].Message.Body);
        var status = await api.Client.GetFromJsonAsync<Dictionary<string, object>>("/api/push/status");
        Assert.Equal("1", status!["devices"].ToString());
    }

    [Fact]
    public async Task Unsubscribing_removes_the_device()
    {
        var api = await TripsApi.SignUp(app, "push-baja@example.com");
        await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/baja"));
        await api.Client.PostAsJsonAsync("/api/push/unsubscribe", new { endpoint = "https://push.example/baja" });

        var status = await api.Client.GetFromJsonAsync<Dictionary<string, object>>("/api/push/status");
        Assert.Equal("0", status!["devices"].ToString());
    }

    [Fact]
    public async Task Due_reminders_are_sent_once_per_departure_time()
    {
        var api = await TripsApi.SignUp(app, "push-recordatorio@example.com");
        await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/recordatorio"));
        var tripId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        await api.PutTrip(tripId);
        // Salida dentro de dos horas y media: el aviso de «tres horas antes» ya toca y sigue dentro de la ventana.
        var startLocal = DateTimeOffset.UtcNow.AddHours(2.5).ToString("yyyy-MM-dd'T'HH:mm");
        await api.PutBooking(bookingId, tripId, new { title = "Tren a Sevilla", type = "train", startLocal, startTz = "UTC", endLocal = (string?)null, endTz = (string?)null });

        var reminders = app.Services.GetServices<IHostedService>().OfType<ReminderService>().Single();
        var first = await reminders.RunOnceAsync(CancellationToken.None);
        var second = await reminders.RunOnceAsync(CancellationToken.None);

        Assert.Equal(1, first);
        Assert.Equal(0, second);
        var soon = app.Sender.Sent.Single(s => s.Message.Tag == $"soon-{bookingId}");
        Assert.StartsWith("Hoy a las ", soon.Message.Title);
        Assert.Contains("Tren", soon.Message.Title);
    }

    [Fact]
    public async Task The_eve_sends_one_summary_per_person_with_everything_of_tomorrow()
    {
        var api = await TripsApi.SignUp(app, "push-resumen@example.com");
        await api.Client.PostAsJsonAsync("/api/push/subscribe", Subscription("https://push.example/resumen"));
        var tripId = Guid.NewGuid();
        await api.PutTrip(tripId, "Argentina", "Buenos Aires, Argentina");

        // Una zona en la que ahora son las 20:xx: la víspera de lo de mañana es ahora mismo.
        var utcNow = DateTime.UtcNow;
        var offset = (20 - utcNow.Hour + 24) % 24;
        if (offset > 14)
        {
            offset -= 24;
        }

        var zone = offset == 0 ? "Etc/GMT" : $"Etc/GMT{(offset > 0 ? "-" : "+")}{Math.Abs(offset)}";
        var tomorrow = utcNow.AddHours(offset).Date.AddDays(1).ToString("yyyy-MM-dd");
        var first = Guid.NewGuid();
        await api.PutBooking(first, tripId, new { title = "Tren a Rosario", type = "train", startLocal = $"{tomorrow}T09:30", startTz = zone, endLocal = (string?)null, endTz = (string?)null, endPlace = (string?)null });
        await api.PutBooking(Guid.NewGuid(), tripId, new { title = "Tango", type = "ticket", startLocal = $"{tomorrow}T21:00", startTz = zone, endLocal = (string?)null, endTz = (string?)null });

        var reminders = app.Services.GetServices<IHostedService>().OfType<ReminderService>().Single();
        await reminders.RunOnceAsync(CancellationToken.None);
        await reminders.RunOnceAsync(CancellationToken.None);

        var summaries = app.Sender.Sent.Where(s => s.Endpoint == "https://push.example/resumen" && s.Message.Tag.StartsWith("eve-")).ToList();
        var summary = Assert.Single(summaries);
        Assert.StartsWith("Mañana, ", summary.Message.Title);
        Assert.Contains("09:30 🚆 Tren a Rosario", summary.Message.Body);
        Assert.Contains("21:00 🎟️ Tango", summary.Message.Body);
        Assert.Contains("en Buenos Aires", summary.Message.Body);
        Assert.Equal($"/trips/{tripId}", summary.Message.Url);
    }
}

public sealed class ReminderRuleTests
{
    private static Booking Flight(string startLocal, string tz = "Europe/Madrid", bool deleted = false) => new()
    {
        Id = Guid.NewGuid(),
        TripId = Guid.NewGuid(),
        Type = "flight",
        Title = "Vuelo",
        StartLocal = startLocal,
        StartTz = tz,
        StartUtcMs = LocalTime.ToUtcMs(startLocal, tz),
        StartPlace = "MAD",
        CreatedBy = "prueba",
        DeletedAtMs = deleted ? 1 : null,
    };

    private static long Utc(int y, int mo, int d, int h, int mi) => new DateTimeOffset(y, mo, d, h, mi, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();

    [Fact]
    public void The_check_in_message_says_the_baggage_when_the_booking_has_it()
    {
        var booking = Flight("2026-10-15T10:00", "America/Argentina/Buenos_Aires");
        booking.Title = "G3 7671 AEP → GIG";
        booking.Notes = "Pasajero: Manuel (12A) · Equipaje: 1 × 23 kg por pasajero · Terminal A";
        Assert.Equal("1 × 23 kg por pasajero", Reminders.BaggageOf(booking.Notes));
        Assert.Contains("Equipaje: 1 × 23 kg por pasajero.", Reminders.CheckInMessage(booking).Body);

        booking.Notes = "Pasajero: Manuel (12A)";
        Assert.Null(Reminders.BaggageOf(booking.Notes));
        Assert.DoesNotContain("Equipaje", Reminders.CheckInMessage(booking).Body);
    }

    [Fact]
    public void The_eve_reminder_is_at_20h_local_of_the_day_before()
    {
        var booking = Flight("2026-10-12T10:05", "America/Argentina/Buenos_Aires");

        // 20:00 del 11/10 en Buenos Aires (UTC-3) = 23:00 UTC.
        Assert.Equal(Utc(2026, 10, 11, 23, 0), Reminders.EveMs(booking));
        Assert.Equal(Utc(2026, 10, 12, 10, 5), Reminders.SoonMs(booking));
    }

    [Fact]
    public void Reminders_fire_inside_their_window_and_only_once()
    {
        var booking = Flight("2026-10-12T10:05");
        var sent = new HashSet<(Guid, string, long)>();

        // La víspera ya no es un aviso por reserva: dispara el resumen del día.
        Assert.Empty(Reminders.EveDue([booking], Utc(2026, 10, 11, 17, 59), sent));
        Assert.Equal([booking], Reminders.EveDue([booking], Utc(2026, 10, 11, 18, 10), sent));
        Assert.Empty(Reminders.Due([booking], Utc(2026, 10, 11, 18, 10), sent));

        sent.Add((booking.Id, "eve", booking.StartUtcMs));
        Assert.Empty(Reminders.EveDue([booking], Utc(2026, 10, 11, 18, 20), sent));
        // Demasiado tarde (más de 90 minutos): ya no tiene sentido avisar de la víspera.
        Assert.Empty(Reminders.EveDue([booking], Utc(2026, 10, 11, 20, 0), new HashSet<(Guid, string, long)>()));

        var soon = Reminders.Due([booking], Utc(2026, 10, 12, 5, 30), sent);
        Assert.Equal(["soon"], soon.Select(r => r.Kind));
        Assert.Equal("Hoy a las 10:05: Vuelo", soon[0].Message.Title);
    }

    [Fact]
    public void The_summary_lists_tomorrow_with_the_weather_the_airport_time_and_the_hotel()
    {
        var flight = Flight("2026-10-09T08:49", "America/Argentina/Buenos_Aires");
        flight.Title = "JA 3157 IGR → AEP";
        var dinner = Flight("2026-10-09T21:00", "America/Argentina/Buenos_Aires");
        dinner.Type = "other";
        dinner.Title = "Cena en Don Julio";
        var oldHotel = Flight("2026-10-06T15:00", "America/Argentina/Buenos_Aires");
        oldHotel.Type = "hotel";
        oldHotel.StartPlace = "Hotel Cataratas";
        oldHotel.EndLocal = "2026-10-09T10:00";
        var newHotel = Flight("2026-10-09T15:00", "America/Argentina/Buenos_Aires");
        newHotel.Type = "hotel";
        newHotel.StartPlace = "Hotel Panamericano";
        newHotel.EndLocal = "2026-10-12T11:00";
        var other = Flight("2026-10-10T09:00");

        var plan = Reminders.PlanFor([dinner, newHotel, flight, oldHotel, other], "2026-10-09");
        Assert.Equal([flight, newHotel, dinner], plan.Starting);
        Assert.Equal([oldHotel], plan.CheckOuts);
        Assert.Same(newHotel, plan.Night);

        var message = Reminders.SummaryMessage(plan, "☀️ Despejado, 24° / 15° en Buenos Aires");
        Assert.Equal("Mañana, viernes 9 de octubre", message.Title);
        Assert.Equal(
            "☀️ Despejado, 24° / 15° en Buenos Aires\n10:00 🧳 Salida de Hotel Cataratas\n08:49 ✈️ JA 3157 IGR → AEP (en el aeropuerto a las 06:49)\n15:00 🏨 Hotel Panamericano\n21:00 📌 Cena en Don Julio",
            message.Body);
        Assert.Equal($"/trips/{flight.TripId}", message.Url);
        Assert.Equal("eve-2026-10-09", message.Tag);
    }

    [Fact]
    public void A_new_departure_time_gets_its_own_reminders_and_deleted_bookings_none()
    {
        var booking = Flight("2026-10-12T10:05");
        var sent = new HashSet<(Guid, string, long)> { (booking.Id, "soon", booking.StartUtcMs - 1) };
        Assert.Single(Reminders.Due([booking], Utc(2026, 10, 12, 5, 10), sent));

        var deleted = Flight("2026-10-12T10:05", deleted: true);
        Assert.Empty(Reminders.Due([deleted], Utc(2026, 10, 12, 5, 10), new HashSet<(Guid, string, long)>()));
    }

    [Fact]
    public void Flights_get_a_check_in_reminder_when_their_airline_opens_it()
    {
        var jetsmart = Flight("2026-10-06T13:33", "America/Argentina/Buenos_Aires");
        jetsmart.Title = "JA 3140 AEP → IGR";
        // JetSMART abre 72 h antes: 13:33 del 3/10 en Buenos Aires = 16:33 UTC.
        Assert.Equal(Utc(2026, 10, 3, 16, 33), Reminders.CheckInMs(jetsmart));
        var due = Reminders.Due([jetsmart], Utc(2026, 10, 3, 16, 40), new HashSet<(Guid, string, long)>());
        Assert.Equal(["checkin"], due.Select(r => r.Kind));
        Assert.Equal("Check-in abierto: JA 3140 AEP → IGR", due[0].Message.Title);

        var unknown = Flight("2026-10-12T10:05");
        Assert.Equal(unknown.StartUtcMs - 24 * 3_600_000L, Reminders.CheckInMs(unknown));

        var train = Flight("2026-10-12T10:05");
        train.Type = "train";
        Assert.Null(Reminders.CheckInMs(train));
    }

    [Theory]
    [InlineData("JA 3140 AEP → IGR", 72)]
    [InlineData("G31234 IGR → GIG", 48)]
    [InlineData("IB 3170 MAD → LHR", 24)]
    [InlineData("VY 1234 BCN → FCO", 168)]
    [InlineData("AVE 05143 Alicante → Madrid", 24)]
    public void Check_in_hours_come_from_the_airline_code(string title, int hours) =>
        Assert.Equal(hours, Airlines.CheckInHoursFor(title));
}
