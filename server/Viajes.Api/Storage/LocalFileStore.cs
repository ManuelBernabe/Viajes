namespace Viajes.Api.Storage;

public sealed class LocalFileStore(string root) : IFileStore
{
    public async Task WriteAsync(string key, Stream content, string contentType, CancellationToken ct)
    {
        var path = PathFor(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        // Se escribe aparte y se sustituye al final: una subida cortada no debe estropear el fichero anterior.
        var temp = $"{path}.{Guid.NewGuid():N}.tmp";
        try
        {
            await using (var file = File.Create(temp))
            {
                await content.CopyToAsync(file, ct);
            }

            await File.WriteAllTextAsync(temp + ".type", contentType, ct);
            File.Move(temp + ".type", path + ".type", overwrite: true);
            File.Move(temp, path, overwrite: true);
        }
        finally
        {
            File.Delete(temp);
            File.Delete(temp + ".type");
        }
    }

    public Task<StoredFile?> OpenReadAsync(string key, CancellationToken ct)
    {
        var path = PathFor(key);
        if (!File.Exists(path))
        {
            return Task.FromResult<StoredFile?>(null);
        }

        var contentType = File.Exists(path + ".type") ? File.ReadAllText(path + ".type") : "application/octet-stream";
        return Task.FromResult<StoredFile?>(new StoredFile(File.OpenRead(path), contentType));
    }

    public Task DeleteAsync(string key, CancellationToken ct)
    {
        var path = PathFor(key);
        File.Delete(path);
        File.Delete(path + ".type");
        return Task.CompletedTask;
    }

    private string PathFor(string key)
    {
        if (!FileKeys.IsValid(key))
        {
            throw new ArgumentException("Clave de fichero no válida.", nameof(key));
        }

        return Path.Combine(root, key.Replace('/', Path.DirectorySeparatorChar));
    }
}
