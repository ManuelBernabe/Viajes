using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;

namespace Viajes.Api.Data;

public static class DataSetup
{
    public static IServiceCollection AddViajesData(this IServiceCollection services, string dataDir)
    {
        // Un interceptor por ámbito, emparejado con su DbContext: guarda la transacción que abre él mismo.
        services.AddScoped<VersionInterceptor>();
        services.AddDbContext<AppDbContext>((provider, options) =>
            options
                .UseSqlite($"Data Source={Path.Combine(dataDir, "viajes.db")}")
                .AddInterceptors(provider.GetRequiredService<VersionInterceptor>()));
        services.AddScoped<AccessService>();

        // En el volumen: si las claves cambiaran en cada despliegue, todas las sesiones caducarían.
        services.AddDataProtection()
            .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDir, "keys")))
            .SetApplicationName("viajes");

        return services;
    }

    public static void MigrateDatabase(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();
        db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
    }
}
