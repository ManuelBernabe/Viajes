namespace Viajes.Api.Storage;

public static class FileResponses
{
    // Solo lo que el navegador muestra sin ejecutar nada. SVG queda fuera: puede llevar scripts.
    private static readonly HashSet<string> Inline =
        ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "application/pdf"];

    // Los ficheros los suben los usuarios y se sirven desde el dominio de la app: nunca deben poder ejecutarse en él.
    public static IResult Serve(HttpContext http, StoredFile file)
    {
        var mediaType = file.ContentType.Split(';')[0].Trim().ToLowerInvariant();
        http.Response.Headers.XContentTypeOptions = "nosniff";
        http.Response.Headers.ContentSecurityPolicy = "sandbox";
        return Results.Stream(file.Content, Inline.Contains(mediaType) ? mediaType : "application/octet-stream");
    }
}
