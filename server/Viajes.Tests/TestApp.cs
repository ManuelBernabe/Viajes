using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Viajes.Api.Ai;

namespace Viajes.Tests;

public class TestApp : WebApplicationFactory<Program>
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "viajes-tests", Guid.NewGuid().ToString("N"));

    public string DataDir => Path.Combine(_root, "data");

    public string SpaDir => Path.Combine(_root, "spa");

    public const string RegistrationCode = "codigo-de-prueba";

    protected int AuthRateLimit { get; set; } = 1000;

    /// <summary>Extractor de reservas con IA a usar en vez del real (que necesita clave). Null = no configurado.</summary>
    protected virtual IBookingExtractor? Extractor => null;

    public HttpClient CreateHttpsClient(bool handleCookies = true) =>
        CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = handleCookies,
        });

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Directory.CreateDirectory(SpaDir);
        File.WriteAllText(Path.Combine(SpaDir, "index.html"), "<!doctype html><title>Viajes</title>");

        builder.UseSetting("DATA_DIR", DataDir);
        builder.UseSetting("SPA_DIR", SpaDir);
        builder.UseSetting("REGISTRATION_CODE", RegistrationCode);
        builder.UseSetting("AUTH_RATE_LIMIT", AuthRateLimit.ToString());
        builder.UseSetting("FILE_STORE", "local");

        var extractor = Extractor;
        if (extractor is not null)
        {
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IBookingExtractor>();
                services.AddSingleton(extractor);
            });
        }
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // Un fichero aún abierto no debe tumbar la batería; es una carpeta temporal.
        }
    }
}
