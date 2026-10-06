namespace Viajes.Api.Hosting;

/// <summary>
/// Cabeceras de seguridad estándar. La política de contenido solo admite recursos del propio sitio (más blobs para
/// las imágenes y PDF que la app genera en memoria); los estilos en línea son de React y del visor.
/// </summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    private const string ContentSecurityPolicy =
        "default-src 'self'; " +
        // wasm-unsafe-eval: el lector de pasaportes del móvil (tesseract) es WebAssembly; no permite eval de JavaScript.
        "script-src 'self' 'wasm-unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'; " +
        "worker-src 'self' blob:; " +
        "manifest-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'";

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;
        headers["X-Content-Type-Options"] = "nosniff";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["X-Frame-Options"] = "DENY";
        headers["Permissions-Policy"] = "geolocation=(), microphone=(), payment=(), usb=()";
        headers["Content-Security-Policy"] = ContentSecurityPolicy;
        if (context.Request.IsHttps || context.Request.Headers["X-Forwarded-Proto"].ToString().Contains("https", StringComparison.OrdinalIgnoreCase))
        {
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
        }

        await next(context);
    }
}
