namespace Viajes.Api.Hosting;

/// <summary>
/// Identifica el despliegue que responde: commit corto y despliegue (los pone Railway en el entorno)
/// y el instante de arranque del proceso. Sirve para ver en la app si un despliegue nuevo ya está activo.
/// </summary>
public sealed class VersionInfo(IConfiguration config)
{
    public string? Commit { get; } = Shorten(config["RAILWAY_GIT_COMMIT_SHA"]);

    public string? DeploymentId { get; } = Blank(config["RAILWAY_DEPLOYMENT_ID"]);

    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;

    private static string? Shorten(string? sha)
    {
        var value = Blank(sha);
        return value is null ? null : value[..Math.Min(7, value.Length)];
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
