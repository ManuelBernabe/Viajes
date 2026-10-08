using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Viajes.Api.Data;
using Viajes.Api.Weather;

namespace Viajes.Tests;

public sealed class WeatherTests(TestApp app) : IClassFixture<TestApp>
{
    private static string Day(int offset) => DateTime.UtcNow.Date.AddDays(offset).ToString("yyyy-MM-dd");

    [Fact]
    public async Task The_trip_weather_follows_the_hotel_of_each_night()
    {
        var ana = await TripsApi.SignUp(app, "tiempo1@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Argentina y Brasil", "Foz do Iguaçu", Day(0), Day(3))).EnsureSuccessStatusCode();
        (await ana.PutBooking(Guid.NewGuid(), tripId, new
        {
            title = "Hotel Panamericano", type = "hotel", startLocal = $"{Day(0)}T15:00", startTz = "America/Argentina/Buenos_Aires", startPlace = "Hotel Panamericano",
            endLocal = $"{Day(2)}T11:00", endTz = "America/Argentina/Buenos_Aires", endPlace = (string?)null, address = "Carlos Pellegrini 551, Buenos Aires, Argentina",
        })).EnsureSuccessStatusCode();

        var response = await ana.Client.GetAsync($"/api/trips/{tripId}/weather");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var days = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("days").EnumerateArray().ToArray();

        // Dos noches en Buenos Aires; el día de salida aún se amanece allí; el último día, el destino del viaje.
        Assert.Equal([Day(0), Day(1), Day(2), Day(3)], days.Select(d => d.GetProperty("date").GetString()));
        Assert.Equal(["Buenos Aires", "Buenos Aires", "Buenos Aires", "Foz do Iguaçu"], days.Select(d => d.GetProperty("place").GetString()));
        Assert.Equal(0, days[0].GetProperty("code").GetInt32());
        Assert.Equal(61, days[3].GetProperty("code").GetInt32());

        // Quien no ve el viaje no ve su tiempo.
        var other = await TripsApi.SignUp(app, "tiempo2@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/trips/{tripId}/weather")).StatusCode);
    }

    [Fact]
    public void Hotel_addresses_are_searched_from_the_full_address_to_the_city()
    {
        var hotel = new Booking
        {
            Id = Guid.NewGuid(), TripId = Guid.NewGuid(), Type = "hotel", Title = "Hotel", StartLocal = "2026-10-08T15:00", StartTz = "UTC",
            StartPlace = "Hotel Panamericano", Address = "Carlos Pellegrini 551, Buenos Aires, Argentina", CreatedBy = "x",
        };
        Assert.Equal(
            ["Carlos Pellegrini 551, Buenos Aires, Argentina", "Buenos Aires, Argentina", "Hotel Panamericano"],
            WeatherService.HotelQueries(hotel));
    }

    [Fact]
    public void Past_and_far_days_are_left_out()
    {
        var trip = new Trip { Id = Guid.NewGuid(), Title = "Viaje", Destination = "Roma", StartDate = "2026-10-01", EndDate = "2026-11-30", CreatedBy = "x" };
        var days = WeatherService.DayQueries(trip, [], "2026-10-08");
        Assert.Equal("2026-10-08", days[0].Date);
        Assert.Equal("2026-10-23", days[^1].Date);
        Assert.Equal(["Roma"], days[0].Queries);
    }

    [Fact]
    public void Open_meteo_daily_lists_become_days_and_a_readable_line()
    {
        var json = JsonDocument.Parse("""
            {"daily":{"time":["2026-10-08","2026-10-09"],"weather_code":[61,null],"temperature_2m_max":[24.4,20],"temperature_2m_min":[15.6,null],"precipitation_probability_max":[70,null]}}
            """).RootElement;
        var days = OpenMeteoWeatherSource.ParseForecast(json);
        Assert.Equal(new DayForecast("2026-10-08", 61, 24.4, 15.6, 70), days[0]);
        Assert.Null(days[1].Code);

        var line = WeatherCodes.Line(new DayWeather("2026-10-08", "Buenos Aires", 61, 24.4, 15.6, 70));
        Assert.Equal("🌧️ Lluvia, 24° / 16° en Buenos Aires · lluvia 70 %", line);
    }
}
