using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;

namespace Viajes.Api.Hosting;

public static class SpaHosting
{
    // Ficheros que deciden qué versión de la app corre: nunca de caché, o el iPhone no se actualizaría.
    private static readonly HashSet<string> NoCache =
        ["index.html", "sw.js", "registerSW.js", "manifest.webmanifest"];

    public static PhysicalFileProvider CreateProvider(IConfiguration config, IWebHostEnvironment env)
    {
        var dir = Path.GetFullPath(config["SPA_DIR"] ?? Path.Combine(env.ContentRootPath, "wwwroot"));
        Directory.CreateDirectory(dir);
        return new PhysicalFileProvider(dir);
    }

    public static StaticFileOptions StaticOptions(IFileProvider provider) => new()
    {
        FileProvider = provider,
        ContentTypeProvider = new FileExtensionContentTypeProvider
        {
            // .gz: el idioma del lector de pasaportes (tesseract), que se descomprime en el móvil.
            Mappings = { [".webmanifest"] = "application/manifest+json", [".gz"] = "application/gzip" },
        },
        OnPrepareResponse = context =>
        {
            if (NoCache.Contains(context.File.Name))
            {
                context.Context.Response.Headers.CacheControl = "no-cache";
            }
        },
    };
}
