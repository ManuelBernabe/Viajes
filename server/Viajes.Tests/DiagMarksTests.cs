using System.Net;
using System.Net.Http.Json;

namespace Viajes.Tests;

public sealed class DiagMarksTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Resending_the_same_mark_does_not_duplicate_it()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "reenvio@example.com");
        var mark = new { id = Guid.NewGuid(), local = "26/9/2026 10:00:00" };

        var first = await client.PostAsJsonAsync("/api/diag/marks", mark);
        var second = await client.PostAsJsonAsync("/api/diag/marks", mark);
        var marks = await client.GetFromJsonAsync<List<Mark>>("/api/diag/marks");

        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
        Assert.Single(marks!);
    }

    [Fact]
    public async Task Simultaneous_resends_of_the_same_mark_all_succeed_once()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "simultaneo@example.com");
        var mark = new { id = Guid.NewGuid(), local = "a la vez" };

        var responses = await Task.WhenAll(
            Enumerable.Range(0, 20).Select(_ => client.PostAsJsonAsync("/api/diag/marks", mark)));
        var marks = await client.GetFromJsonAsync<List<Mark>>("/api/diag/marks");

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.NoContent, r.StatusCode));
        Assert.Single(marks!);
    }

    [Fact]
    public async Task An_id_owned_by_another_user_is_a_conflict()
    {
        var ana = app.CreateHttpsClient();
        await Auth.RegisterAsync(ana, "ana-marcas@example.com");
        var luis = app.CreateHttpsClient();
        await Auth.RegisterAsync(luis, "luis-marcas@example.com");
        var id = Guid.NewGuid();

        await ana.PostAsJsonAsync("/api/diag/marks", new { id, local = "de Ana" });
        var response = await luis.PostAsJsonAsync("/api/diag/marks", new { id, local = "de Luis" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Each_user_only_lists_their_own_marks()
    {
        var ana = app.CreateHttpsClient();
        await Auth.RegisterAsync(ana, "ana-lista@example.com");
        var luis = app.CreateHttpsClient();
        await Auth.RegisterAsync(luis, "luis-lista@example.com");

        await ana.PostAsJsonAsync("/api/diag/marks", new { id = Guid.NewGuid(), local = "de Ana" });
        var marks = await luis.GetFromJsonAsync<List<Mark>>("/api/diag/marks");

        Assert.Empty(marks!);
    }

    [Fact]
    public async Task Marks_require_a_session()
    {
        var response = await app.CreateHttpsClient().PostAsJsonAsync(
            "/api/diag/marks", new { id = Guid.NewGuid(), local = "x" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private sealed record Mark(Guid Id, string Local);
}
