using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Viajes.Api.Ai;
using Viajes.Api.Data;
using Viajes.Api.Trips;

namespace Viajes.Tests;

/// <summary>IA de mentira para las sugerencias: recuerda la pregunta y devuelve un JSON fijo.</summary>
public sealed class FakePlaceAi : IBookingExtractor, IJsonAsker
{
    public List<string> Prompts { get; } = [];

    public string? Answer { get; set; } = """
        {"places": [
          {"name": "Caminito", "category": "see", "description": "Casas de colores en La Boca.", "address": "La Boca", "area": "Argentina"},
          {"name": "Don Julio", "category": "eat", "description": "Parrilla clásica; reserva antes.", "address": null, "area": "Argentina"},
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
    public async Task Ideas_are_kept_in_the_trip_and_new_requests_add_to_them()
    {
        var ana = await TripsApi.SignUp(app, "sugerencias4@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Argentina", "Buenos Aires")).EnsureSuccessStatusCode();

        async Task<string?[]> Listed()
        {
            var body = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/place-suggestions");
            return body.GetProperty("suggestions").EnumerateArray().Select(s => s.GetProperty("name").GetString()).ToArray();
        }

        Assert.Empty(await Listed());
        (await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/place-suggestions", new { lang = "es" })).EnsureSuccessStatusCode();
        Assert.Equal(["Caminito", "Don Julio", "Mercado de San Telmo", "Sitio raro"], await Listed());

        // Otra petición: la IA no ve nada nuevo (repite las mismas), así que no se duplica nada y se le dice que ya las propuso.
        var again = await (await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/place-suggestions", new { lang = "es" })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, again.GetProperty("added").GetInt32());
        Assert.Equal(4, again.GetProperty("suggestions").GetArrayLength());
        Assert.Contains("Don Julio", app.Fake.Prompts.Last());

        // Añadida a «Lugares» sigue en la lista (la app la oculta mientras esté ahí); quitada, ya no sale.
        (await ana.Client.PutAsJsonAsync($"/api/places/{Guid.NewGuid()}", new { tripId, name = "Caminito", category = "see", visited = false })).EnsureSuccessStatusCode();
        var body = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/place-suggestions");
        var donJulio = body.GetProperty("suggestions").EnumerateArray().First(s => s.GetProperty("name").GetString() == "Don Julio").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await ana.Client.DeleteAsync($"/api/trips/{tripId}/place-suggestions/{donJulio}")).StatusCode);
        Assert.Equal(["Caminito", "Mercado de San Telmo", "Sitio raro"], await Listed());

        var luis = await TripsApi.SignUp(app, "sugerencias4-luis@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.GetAsync($"/api/trips/{tripId}/place-suggestions")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await luis.Client.DeleteAsync($"/api/trips/{tripId}/place-suggestions/{donJulio}")).StatusCode);
    }

    [Fact]
    public async Task Ideas_bring_their_country_and_old_ideas_are_classified_once()
    {
        var ana = await TripsApi.SignUp(app, "sugerencias5@example.com");
        var tripId = Guid.NewGuid();
        (await ana.PutTrip(tripId, "Argentina Brasil", "Argentina y Brasil")).EnsureSuccessStatusCode();
        (await ana.Client.PostAsJsonAsync($"/api/trips/{tripId}/place-suggestions", new { lang = "es" })).EnsureSuccessStatusCode();
        Assert.Contains("area: el país", app.Fake.Prompts.Last());

        // Una idea guardada antes de que existiera el país.
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.PlaceIdeas.Add(new PlaceIdea { Id = Guid.NewGuid(), TripId = tripId, Name = "Escadaria Selarón", Category = "see", Description = "Escalera de azulejos.", CreatedAtMs = 1 });
            await db.SaveChangesAsync();
        }

        var previous = app.Fake.Answer;
        app.Fake.Answer = """{"areas": [{"name": "Escadaria Selarón", "area": "Brasil"}]}""";
        try
        {
            var body = await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/place-suggestions?lang=es");
            var areas = body.GetProperty("suggestions").EnumerateArray()
                .ToDictionary(s => s.GetProperty("name").GetString()!, s => s.GetProperty("area").ValueKind == JsonValueKind.Null ? null : s.GetProperty("area").GetString());
            Assert.Equal("Argentina", areas["Caminito"]);
            Assert.Equal("Brasil", areas["Escadaria Selarón"]);
            Assert.Null(areas["Sitio raro"]);

            var asked = app.Fake.Prompts.Count;
            await ana.Client.GetFromJsonAsync<JsonElement>($"/api/trips/{tripId}/place-suggestions?lang=es");
            Assert.Equal(asked, app.Fake.Prompts.Count);
        }
        finally
        {
            app.Fake.Answer = previous;
        }
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
