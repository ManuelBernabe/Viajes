using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Viajes.Api.Ai;
using Viajes.Api.Trips;

namespace Viajes.Tests;

/// <summary>IA de mentira para las sugerencias: recuerda la pregunta y devuelve un JSON fijo.</summary>
public sealed class FakePlaceAi : IBookingExtractor, IJsonAsker
{
    public List<string> Prompts { get; } = [];

    public string? Answer { get; set; } = """
        {"places": [
          {"name": "Caminito", "category": "see", "description": "Casas de colores en La Boca.", "address": "La Boca"},
          {"name": "Don Julio", "category": "eat", "description": "Parrilla clásica; reserva antes.", "address": null},
          {"name": "caminito", "category": "see", "description": "Repetido.", "address": null},
          {"name": "Mercado de San Telmo", "category": "eat", "description": "Ya está en la lista.", "address": null},
          {"name": "Sitio raro", "category": "fiesta", "description": "Categoría desconocida.", "address": null}
        ]}
        """;

    public bool IsAvailable => true;

    public Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct) => Task.FromResult<Extraction?>(null);

    public Task<string?> AskJsonAsync(string system, string user, JsonElement schema, int maxTokens, CancellationToken ct)
    {
        Prompts.Add(user);
        return Task.FromResult(Answer);
    }
}

public sealed class PlaceAiApp : TestApp
{
    public FakePlaceAi Fake { get; } = new();

    protected override IBookingExtractor? Extractor => Fake;
}

public sealed class PlaceSuggestionTests(PlaceAiApp app) : IClassFixture<PlaceAiApp>
{
    [Fact]
    public async Task Suggestions_skip_repeated_and_existing_places_and_fix_unknown_categories()
    {
        var ana = await TripsApi.SignUp(app, "sugerencias1@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Argentina Brasil", "Buenos Aires")).EnsureSuccessStatusCode();
        (await ana.Client.PutAsJsonAsync($"/api/places/{Guid.NewGuid()}", new { tripId, name = "Mercado de San Telmo", category = "eat", visited = false })).EnsureSuccessStatusCode();

        var response = await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/place-suggestions", new { lang = "en" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var suggestions = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("suggestions").EnumerateArray().ToArray();

        Assert.Equal(["Caminito", "Don Julio", "Sitio raro"], suggestions.Select(s => s.GetProperty("name").GetString()));
        Assert.Equal("other", suggestions[2].GetProperty("category").GetString());
        var prompt = app.Fake.Prompts.Last();
        Assert.Contains("Buenos Aires", prompt);
        Assert.Contains("Mercado de San Telmo", prompt);
        Assert.Contains("English", prompt);
    }

    [Fact]
    public async Task Someone_outside_the_household_gets_404_and_a_useless_answer_is_502()
    {
        var ana = await TripsApi.SignUp(app, "sugerencias2-ana@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Roma")).EnsureSuccessStatusCode();
        var luis = await TripsApi.SignUp(app, "sugerencias2-luis@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.PostAsJsonAsync($"/api/trips/{tripId}/place-suggestions", new { lang = "es" })).StatusCode);

        var previous = app.Fake.Answer;
        app.Fake.Answer = "esto no es JSON";
        try
        {
            Assert.Equal(HttpStatusCode.BadGateway, (await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/place-suggestions", new { lang = "es" })).StatusCode);
        }
        finally
        {
            app.Fake.Answer = previous;
        }
    }

    [Fact]
    public void Parse_returns_null_for_garbage_and_caps_lengths()
    {
        Assert.Null(PlaceSuggestions.Parse(null, []));
        Assert.Null(PlaceSuggestions.Parse("{\"otra\": 1}", []));
        var longName = new string('x', 500);
        var parsed = PlaceSuggestions.Parse($"{{\"places\": [{{\"name\": \"{longName}\", \"category\": \"eat\", \"description\": \"d\", \"address\": null}}]}}", []);
        Assert.Equal(200, Assert.Single(parsed!).Name.Length);
    }
}

public sealed class NoAiPlaceTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Without_an_ai_key_suggestions_answer_503()
    {
        var ana = await TripsApi.SignUp(app, "sugerencias3@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Lisboa")).EnsureSuccessStatusCode();
        var response = await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/place-suggestions", new { lang = "es" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }
}
