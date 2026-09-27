using System.IO.Compression;
using Microsoft.Data.Sqlite;

namespace Viajes.Api.Backup;

/// <summary>Dónde están los datos: la base, los ficheros subidos, las claves de sesión y la carpeta de copias.</summary>
public sealed class BackupPaths(string dataDir)
{
    public string DataDir { get; } = dataDir;

    public string Database => Path.Combine(DataDir, "viajes.db");

    public string Files => Path.Combine(DataDir, "files");

    public string Keys => Path.Combine(DataDir, "keys");

    public string Backups => Path.Combine(DataDir, "backups");
}

public sealed record LocalBackup(string Name, long Size, long CreatedMs);

/// <summary>Copias de seguridad: instantánea coherente de la base (VACUUM INTO) y un zip con todo lo del volumen.</summary>
public sealed class BackupService(BackupPaths paths, ILogger<BackupService> log)
{
    public const int KeepLocal = 14;

    /// <summary>Instantánea coherente de la base aunque esté en uso (modo WAL): SQLite la escribe entera en <paramref name="target"/>.</summary>
    public void Snapshot(string target)
    {
        if (File.Exists(target))
        {
            File.Delete(target);
        }

        using var connection = new SqliteConnection($"Data Source={paths.Database};Mode=ReadOnly");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "VACUUM INTO @target";
        command.Parameters.AddWithValue("@target", target);
        command.ExecuteNonQuery();
    }

    /// <summary>
    /// Zip con la base (instantánea), los ficheros subidos y las claves de sesión. Se monta en un fichero temporal
    /// (ZipArchive escribe en síncrono, y la respuesta HTTP no lo admite) y se copia a la salida en asíncrono.
    /// </summary>
    public async Task WriteZipAsync(Stream output, CancellationToken ct)
    {
        var id = Guid.NewGuid().ToString("N");
        var snapshot = Path.Combine(Path.GetTempPath(), $"viajes-snapshot-{id}.db");
        var zipPath = Path.Combine(Path.GetTempPath(), $"viajes-backup-{id}.zip");
        try
        {
            Snapshot(snapshot);
            using (var file = new FileStream(zipPath, FileMode.Create, FileAccess.ReadWrite, FileShare.None))
            using (var zip = new ZipArchive(file, ZipArchiveMode.Create, leaveOpen: false))
            {
                AddFile(zip, snapshot, "viajes.db");
                foreach (var (root, prefix) in new[] { (paths.Files, "files"), (paths.Keys, "keys") })
                {
                    if (!Directory.Exists(root))
                    {
                        continue;
                    }

                    foreach (var path in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
                    {
                        ct.ThrowIfCancellationRequested();
                        var relative = Path.GetRelativePath(root, path).Replace(Path.DirectorySeparatorChar, '/');
                        AddFile(zip, path, $"{prefix}/{relative}");
                    }
                }
            }

            await using var read = new FileStream(zipPath, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16, useAsync: true);
            await read.CopyToAsync(output, ct);
        }
        finally
        {
            File.Delete(snapshot);
            File.Delete(zipPath);
        }
    }

    /// <summary>Copia diaria en el propio volumen (solo la base, que es lo que se puede estropear con un error de la app).</summary>
    public LocalBackup? DailySnapshot(DateOnly today)
    {
        Directory.CreateDirectory(paths.Backups);
        var name = $"viajes-{today:yyyy-MM-dd}.db";
        var target = Path.Combine(paths.Backups, name);
        if (File.Exists(target))
        {
            return null;
        }

        Snapshot(target);
        Prune(KeepLocal);
        var info = new FileInfo(target);
        log.LogInformation("Copia local de la base creada: {Nombre} ({Bytes} bytes).", name, info.Length);
        return new LocalBackup(name, info.Length, new DateTimeOffset(info.CreationTimeUtc).ToUnixTimeMilliseconds());
    }

    public IReadOnlyList<LocalBackup> ListLocal()
    {
        if (!Directory.Exists(paths.Backups))
        {
            return [];
        }

        return Directory.EnumerateFiles(paths.Backups, "viajes-*.db")
            .Select(f => new FileInfo(f))
            .OrderByDescending(f => f.Name)
            .Select(f => new LocalBackup(f.Name, f.Length, new DateTimeOffset(f.CreationTimeUtc).ToUnixTimeMilliseconds()))
            .ToList();
    }

    /// <summary>Se quedan las <paramref name="keep"/> copias más recientes (por nombre, que lleva la fecha).</summary>
    public static IEnumerable<string> ToPrune(IEnumerable<string> names, int keep) =>
        names.OrderByDescending(n => n).Skip(keep);

    private void Prune(int keep)
    {
        var names = Directory.EnumerateFiles(paths.Backups, "viajes-*.db").Select(Path.GetFileName).Select(n => n!).ToList();
        foreach (var name in ToPrune(names, keep))
        {
            File.Delete(Path.Combine(paths.Backups, name));
        }
    }

    private static void AddFile(ZipArchive zip, string path, string entryName)
    {
        var entry = zip.CreateEntry(entryName, CompressionLevel.Fastest);
        using var target = entry.Open();
        using var source = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        source.CopyTo(target);
    }
}

/// <summary>Una vez al día (y al arrancar) deja una copia de la base en el volumen; guarda las 14 últimas.</summary>
public sealed class DailyBackupService(BackupService backups, ILogger<DailyBackupService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken).ContinueWith(_ => { }, TaskScheduler.Default);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                backups.DailySnapshot(DateOnly.FromDateTime(DateTime.UtcNow));
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "No se pudo hacer la copia local de la base.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
