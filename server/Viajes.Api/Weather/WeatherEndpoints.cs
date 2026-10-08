using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;

namespace Viajes.Api.Weather;

public static class WeatherEndpoints
{
    public static IServiceCollection AddWeather(this IServiceCollection services)
    {
        services.AddHttpClient(OpenMeteoWeatherSource.ClientName, client =>
        {
            client.Timeout = TimeSpan.FromSeconds(10);
            // Nominatim exige identificar la aplicación.
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Viajes/1.0 (+https://github.com/ManuelBernabe/Viajes)");
        });
        services.AddSingleton<IWeatherSource, OpenMeteoWeatherSource>();
        services.AddSingleton<WeatherService>();
        return services;
    }

    public static void MapWeatherEndpoints(this IEndpointRouteBuilder app)
    {
        // La previsión día a día del viaje, con el sitio de cada día.
        app.MapGet("/api/trips/{id:guid}/weather", async (
            Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, WeatherService weather, CancellationToken ct) =>
        {
            var userId = users.GetUserId(principal)!;
            var trip = await access.VisibleTrip(userId, id);
            if (trip is null || trip.DeletedAtMs is not null)
            {
                return Results.NotFound();
            }

            var bookings = await access.VisibleBookings(userId).Where(b => b.TripId == id && b.DeletedAtMs == null).ToListAsync(ct);
            return Results.Ok(new { days = await weather.ForTripAsync(trip, bookings, ct) });
        }).RequireAuthorization();
    }
}
