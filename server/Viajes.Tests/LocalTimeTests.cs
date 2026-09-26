using Viajes.Api.Trips;

namespace Viajes.Tests;

public sealed class LocalTimeTests
{
    [Fact]
    public void Madrid_in_summer_is_two_hours_ahead_of_utc()
    {
        var ms = LocalTime.ToUtcMs("2026-10-12T10:05", "Europe/Madrid");

        Assert.Equal(new DateTimeOffset(2026, 10, 12, 8, 5, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), ms);
    }

    [Fact]
    public void Madrid_in_winter_is_one_hour_ahead_of_utc()
    {
        var ms = LocalTime.ToUtcMs("2026-12-01T10:05", "Europe/Madrid");

        Assert.Equal(new DateTimeOffset(2026, 12, 1, 9, 5, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), ms);
    }

    [Fact]
    public void Tokyo_is_nine_hours_ahead_all_year()
    {
        var ms = LocalTime.ToUtcMs("2026-10-13T07:30", "Asia/Tokyo");

        Assert.Equal(new DateTimeOffset(2026, 10, 12, 22, 30, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), ms);
    }

    [Fact]
    public void A_madrid_to_tokyo_flight_orders_by_real_instant()
    {
        // Sale a las 12:00 de Madrid y llega a las 08:55 (hora de Tokio) del día siguiente: la llegada es después.
        var departure = LocalTime.ToUtcMs("2026-10-12T12:00", "Europe/Madrid");
        var arrival = LocalTime.ToUtcMs("2026-10-13T08:55", "Asia/Tokyo");

        Assert.True(arrival > departure);
        Assert.Equal(13 * 60 + 55, (arrival - departure) / 60_000);
    }

    [Fact]
    public void A_time_skipped_by_the_clock_change_moves_one_hour_forward()
    {
        // El 29/03/2026 a las 02:30 no existe en Madrid (se salta de 02:00 a 03:00).
        var ms = LocalTime.ToUtcMs("2026-03-29T02:30", "Europe/Madrid");

        Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 30, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), ms);
    }

    [Fact]
    public void Unknown_zone_or_bad_time_are_rejected()
    {
        Assert.Throws<ArgumentException>(() => LocalTime.ToUtcMs("2026-10-12T10:05", "Marte/Olympus"));
        Assert.Throws<ArgumentException>(() => LocalTime.ToUtcMs("12/10/2026 10:05", "Europe/Madrid"));
        Assert.False(LocalTime.IsValidZone(""));
        Assert.True(LocalTime.IsValidZone("America/New_York"));
        Assert.True(LocalTime.IsValidLocal("2026-10-12T10:05:00"));
    }
}
