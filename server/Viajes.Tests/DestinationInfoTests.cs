using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Viajes.Api.Ai;
using Viajes.Api.Trips;

namespace Viajes.Tests;

/// <summary>Cambio de moneda fijo, sin salir a internet.</summary>
public sealed class FakeRates() : ExchangeRates(null!, NullLogger<ExchangeRates>.Instance)
{
    public override Task<(Dictionary<string, double> Rates, long AtMs)?> GetAsync(CancellationToken ct) =>
        Task.FromResult<(Dictionary<string, double>, long)?>((new Dictionary<string, double> { ["ARS"] = 1450.5, ["BRL"] = 6.2 }, 1_700_000_000_000));
}

public sealed class DestinationApp : TestApp
{
    public FakePlaceAi Fake { get; } = new()
    {
        Answer = """
            {"countries": [
              {"country": "Argentina", "flag": "🇦🇷", "currencyCode": "ars", "currencyName": "Peso argentino", "plugs": "C, I", "voltage": "220 V",
               "emergency": "911", "tipping": "10 %", "language": "Español", "visa": "No hace falta visado.", "tips": ["Lleva efectivo", " "], "embassy": "Embajada de España en Buenos Aires: +54 11 0000 0000"},
              {"country": "Brasil", "flag": "🇧🇷", "currencyCode": "BRL", "currencyName": "Real", "plugs": "N", "voltage": "127/220 V",
               "emergency": "190", "tipping": "10 % incluido", "language": "Portugués", "visa": "No hace falta visado.", "tips": []},
              {"country": "", "flag": null}
            ]}
            """,
    };

    protected override IBookingExtractor? Extractor => Fake;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<ExchangeRates>();
            services.AddSingleton<ExchangeRates>(new FakeRates());
        });
    }
}

public sealed class DestinationInfoTests(DestinationApp app) : IClassFixture<DestinationApp>
{
    [Fact]
    public async Task Destination_info_is_generated_once_cached_and_carries_todays_rate()
    {
        var ana = await TripsApi.SignUp(app, "destino1@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Argentina Brasil", "Buenos Aires")).EnsureSuccessStatusCode();

        var before = app.Fake.Prompts.Count;
        var info = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/destination-info?lang=en");
        var countries = info.GetProperty("countries").EnumerateArray().ToArray();
        Assert.Equal(["Argentina", "Brasil"], countries.Select(c => c.GetProperty("country").GetString()));
        Assert.Equal("ARS", countries[0].GetProperty("currencyCode").GetString());
        Assert.Equal(1450.5, countries[0].GetProperty("rate").GetDouble());
        Assert.Equal(["Lleva efectivo"], countries[0].GetProperty("tips").EnumerateArray().Select(t => t.GetString()));
        Assert.Equal("Embajada de España en Buenos Aires: +54 11 0000 0000", countries[0].GetProperty("embassy").GetString());
        Assert.Equal(1_700_000_000_000, info.GetProperty("ratesMs").GetInt64());
        Assert.Contains("English", app.Fake.Prompts.Last());
        Assert.Contains("Buenos Aires", app.Fake.Prompts.Last());

        // La segunda vez sale de lo guardado; «Actualizar» vuelve a preguntar.
        await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/destination-info?lang=en");
        Assert.Equal(before + 1, app.Fake.Prompts.Count);
        await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/destination-info?lang=en&refresh=true");
        Assert.Equal(before + 2, app.Fake.Prompts.Count);

        var other = await TripsApi.SignUp(app, "destino2@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/trips/{tripId}/destination-info")).StatusCode);
    }
}
