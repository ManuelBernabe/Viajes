using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Viajes.Api.Backup;

namespace Viajes.Tests;

public sealed class BackupTests(TestApp app) : IClassFixture<TestApp>
{
    private static async Task<string> CreateToken(TripsApi api, string scope)
    {
        var response = await api.Client.PostAsJsonAsync("/api/import-tokens/", new { label = "prueba", scope });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    }

    private static HttpClient WithToken(TestApp app, string token)
    {
        var client = app.CreateHttpsClient(handleCookies: false);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Fact]
    public async Task The_backup_zip_holds_a_consistent_database_and_the_uploaded_files()
    {
        var api = await TripsApi.SignUp(app, "copia-admin@example.com");
        var tripId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        await api.PutTrip(tripId, "Viaje copiado");
        await api.PutBooking(bookingId, tripId);
        await api.PutAttachment(attachmentId, bookingId, size: 4);
        await api.PutContent(attachmentId, [1, 2, 3, 4]);
        var token = await CreateToken(api, "backup");

        var response = await WithToken(app, token).GetAsync("/api/backup");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/zip", response.Content.Headers.ContentType?.MediaType);
        using var zip = new ZipArchive(await response.Content.ReadAsStreamAsync(), ZipArchiveMode.Read);
        var names = zip.Entries.Select(e => e.FullName).ToList();
        Assert.Contains("viajes.db", names);
        Assert.Contains(names, n => n.StartsWith("files/") && n.Contains(attachmentId.ToString()));
        Assert.Contains(names, n => n.StartsWith("keys/"));

        // La base copiada se abre y contiene el viaje.
        var temp = Path.Combine(Path.GetTempPath(), $"copia-{Guid.NewGuid():N}.db");
        zip.GetEntry("viajes.db")!.ExtractToFile(temp);
        try
        {
            using var connection = new SqliteConnection($"Data Source={temp};Mode=ReadOnly");
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM Trips WHERE Title = 'Viaje copiado'";
            Assert.Equal(1L, (long)command.ExecuteScalar()!);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(temp);
        }
    }

    [Fact]
    public async Task Only_a_backup_token_downloads_and_it_cannot_import_emails()
    {
        var api = await TripsApi.SignUp(app, "copia-tokens@example.com");
        var importToken = await CreateToken(api, "import");
        var backupToken = await CreateToken(api, "backup");

        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateHttpsClient().GetAsync("/api/backup")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await WithToken(app, importToken).GetAsync("/api/backup")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await WithToken(app, "no-existe").GetAsync("/api/backup")).StatusCode);

        var import = WithToken(app, backupToken);
        var content = new StringContent("From: a@b.c\r\nSubject: x\r\n\r\nhola", System.Text.Encoding.UTF8);
        content.Headers.ContentType = new MediaTypeHeaderValue("message/rfc822");
        Assert.Equal(HttpStatusCode.Unauthorized, (await import.PostAsync("/api/inbox/import", content)).StatusCode);

        var list = await api.Client.GetFromJsonAsync<JsonElement>("/api/import-tokens/");
        Assert.Equal(["backup", "import"], list.EnumerateArray().Select(t => t.GetProperty("scope").GetString()).OrderBy(s => s));
    }

    [Fact]
    public async Task A_plain_member_cannot_create_backup_tokens()
    {
        var admin = await TripsApi.SignUp(app, "copia-hogar-admin@example.com");
        var invite = await admin.Client.PostAsJsonAsync("/api/household/invitations", new { });
        var token = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var client = app.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new { email = "copia-hogar-miembro@example.com", password = Auth.Password, invitation = token })).EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync("/api/import-tokens/", new { label = "x", scope = "backup" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Daily_snapshots_are_created_once_per_day_listed_and_pruned()
    {
        await TripsApi.SignUp(app, "copia-diaria@example.com");
        var backups = app.Services.GetRequiredService<BackupService>();

        var first = backups.DailySnapshot(new DateOnly(2026, 9, 27));
        var again = backups.DailySnapshot(new DateOnly(2026, 9, 27));

        Assert.NotNull(first);
        Assert.Equal("viajes-2026-09-27.db", first.Name);
        Assert.True(first.Size > 0);
        Assert.Null(again);
        Assert.Contains(backups.ListLocal(), b => b.Name == "viajes-2026-09-27.db");

        var api = await TripsApi.SignUp(app, "copia-diaria-2@example.com");
        var local = await api.Client.GetFromJsonAsync<JsonElement>("/api/backup/local");
        Assert.Contains(local.EnumerateArray(), b => b.GetProperty("name").GetString() == "viajes-2026-09-27.db");

        var names = Enumerable.Range(1, 20).Select(d => $"viajes-2026-08-{d:00}.db").ToList();
        Assert.Equal(6, BackupService.ToPrune(names, 14).Count());
        Assert.Equal("viajes-2026-08-06.db", BackupService.ToPrune(names, 14).Max());
    }
}
