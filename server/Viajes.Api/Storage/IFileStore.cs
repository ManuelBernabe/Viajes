namespace Viajes.Api.Storage;

public sealed record StoredFile(Stream Content, string ContentType);

public interface IFileStore
{
    Task WriteAsync(string key, Stream content, string contentType, CancellationToken ct);

    Task<StoredFile?> OpenReadAsync(string key, CancellationToken ct);

    /// <summary>Borra el fichero si existe; no falla si no está.</summary>
    Task DeleteAsync(string key, CancellationToken ct);
}
