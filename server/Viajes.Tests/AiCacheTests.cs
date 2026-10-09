using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Viajes.Api.Ai;

namespace Viajes.Tests;

public sealed class AiCacheTests(TestApp app) : IClassFixture<TestApp>
{
    private sealed class CountingAi : IBookingExtractor, IJsonAsker
    {
        public int Calls { get; private set; }

        public bool IsAvailable => true;

        public Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult<Extraction?>(new Extraction("flight", $"Vuelo {Calls}", null, null, null, null, null, null, null, null, null));
        }

        public Task<string?> AskJsonAsync(string system, string user, JsonElement schema, int maxTokens, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult<string?>($$"""{"n": {{Calls}}}""");
        }
    }

    [Fact]
    public async Task The_same_question_is_answered_from_the_cache_unless_a_fresh_answer_is_asked()
    {
        var inner = new CountingAi();
        var ai = new CachedAi(inner, app.Services.GetRequiredService<IServiceScopeFactory>(), NullLogger<CachedAi>.Instance);
        var schema = JsonSerializer.SerializeToElement(new { type = "object" });
        var question = $"¿Qué tiempo hace? {Guid.NewGuid()}";

        Assert.Equal("""{"n": 1}""", await ai.AskJsonAsync("sistema", question, schema, 100, default));
        Assert.Equal("""{"n": 1}""", await ai.AskJsonAsync("sistema", question, schema, 100, default));
        Assert.Equal(1, inner.Calls);

        using (CachedAi.Fresh())
        {
            Assert.Equal("""{"n": 2}""", await ai.AskJsonAsync("sistema", question, schema, 100, default));
        }

        // Lo nuevo queda guardado; otra pregunta es otra entrada.
        Assert.Equal("""{"n": 2}""", await ai.AskJsonAsync("sistema", question, schema, 100, default));
        Assert.Equal("""{"n": 3}""", await ai.AskJsonAsync("sistema", question + "?", schema, 100, default));

        // Leer el mismo PDF dos veces: una sola llamada.
        var pdf = new ExtractionFile("billete.pdf", "application/pdf", Guid.NewGuid().ToByteArray());
        var first = await ai.ExtractAsync(new ExtractionInput(null, [pdf]), default);
        var second = await ai.ExtractAsync(new ExtractionInput(null, [pdf with { Name = "otro nombre.pdf" }]), default);
        Assert.Equal(first?.Title, second?.Title);
        Assert.Equal(4, inner.Calls);
    }
}

public sealed class AiStatusTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task The_admin_sees_which_ai_the_server_uses()
    {
        var ana = await TripsApi.SignUp(app, "estado-ia@example.com");
        var status = await System.Net.Http.Json.HttpClientJsonExtensions.GetFromJsonAsync<JsonElement>(ana.Client, "/api/settings/ai");
        Assert.Equal("Sin IA", status.GetProperty("provider").GetString());
        Assert.True(status.GetProperty("cachedAnswers").GetInt32() >= 0);
    }
}
