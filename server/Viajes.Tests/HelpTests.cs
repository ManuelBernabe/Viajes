using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Viajes.Api.Help;

namespace Viajes.Tests;

public sealed class HelpTests(PlaceAiApp app) : IClassFixture<PlaceAiApp>
{
    [Fact]
    public async Task The_assistant_answers_with_the_guide_and_only_known_screens()
    {
        var ana = await TripsApi.SignUp(app, "ayuda1@example.com");
        var previous = app.Fake.Answer;
        app.Fake.Answer = """{"answer": "Ve a «Ajustes» → «Face ID» y pulsa «Activar Face ID».", "route": "/settings"}""";
        try
        {
            var response = await ana.Client.PostAsJsonAsync("/api/help/ask", new
            {
                lang = "es",
                messages = new[] { new { role = "user", text = "Hola" }, new { role = "assistant", text = "¿En qué te ayudo?" }, new { role = "user", text = "¿Cómo activo Face ID?" } },
            });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Contains("Face ID", body.GetProperty("text").GetString());
            Assert.Equal("/settings", body.GetProperty("route").GetString());
            var prompt = app.Fake.Prompts.Last();
            Assert.Contains("Persona: ¿Cómo activo Face ID?", prompt);
            Assert.Contains("Asistente: ¿En qué te ayudo?", prompt);

            app.Fake.Answer = """{"answer": "Mira aquí.", "route": "/admin/secreto"}""";
            var other = await (await ana.Client.PostAsJsonAsync("/api/help/ask", new { messages = new[] { new { role = "user", text = "¿Y esto?" } } })).Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(JsonValueKind.Null, other.GetProperty("route").ValueKind);

            Assert.Equal(HttpStatusCode.BadRequest, (await ana.Client.PostAsJsonAsync("/api/help/ask", new { messages = new[] { new { role = "assistant", text = "Hola" } } })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateHttpsClient().PostAsJsonAsync("/api/help/ask", new { messages = new[] { new { role = "user", text = "Hola" } } })).StatusCode);
        }
        finally
        {
            app.Fake.Answer = previous;
        }
    }

    [Fact]
    public void Parse_needs_an_answer()
    {
        Assert.Null(HelpEndpoints.Parse("""{"answer": " ", "route": null}"""));
        Assert.Null(HelpEndpoints.Parse("no"));
        Assert.Equal(new HelpEndpoints.Answer("Sí.", "/documents"), HelpEndpoints.Parse("""{"answer": "Sí.", "route": "/documents"}"""));
    }
}
