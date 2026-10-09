using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;

namespace Viajes.Api.Ai;

/// <summary>
/// Caché de las respuestas de la IA: la misma pregunta (mismo correo, mismo PDF, mismo viaje en el mismo estado) no se
/// vuelve a pagar. Se guarda en la base de datos (AppSettings «ai:…», sobrevive a los despliegues) con la huella SHA-256
/// de todo lo que se manda. Lecturas de reservas, 90 días; el resto, 7. Quien quiera una respuesta nueva («Actualizar»)
/// abre un <see cref="Fresh"/>: se pregunta de nuevo y se guarda lo nuevo.
/// </summary>
public sealed class CachedAi(IBookingExtractor inner, IServiceScopeFactory scopes, ILogger<CachedAi> log) : IBookingExtractor, IJsonAsker
{
    /// <summary>Cambia esto si cambian los prompts de lectura de forma que las respuestas viejas ya no valgan.</summary>
    public const string Version = "1";

    public static readonly TimeSpan ExtractionTtl = TimeSpan.FromDays(90);
    public static readonly TimeSpan JsonTtl = TimeSpan.FromDays(7);

    private static readonly AsyncLocal<bool> Bypass = new();
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private IJsonAsker? Asker => inner as IJsonAsker;

    public bool IsAvailable => inner.IsAvailable;

    /// <summary>Mientras dure, las preguntas van a la IA aunque estén en la caché (y se guarda la respuesta nueva).</summary>
    public static IDisposable Fresh()
    {
        Bypass.Value = true;
        return new Reset();
    }

    private sealed class Reset : IDisposable
    {
        public void Dispose() => Bypass.Value = false;
    }

    public async Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct)
    {
        var key = Key("x", inner.GetType().Name, input.Text, input.Files);
        if (await ReadAsync(key, ExtractionTtl, ct) is { } cached)
        {
            return JsonSerializer.Deserialize<Extraction>(cached, Json);
        }

        var extraction = await inner.ExtractAsync(input, ct);
        if (extraction is not null)
        {
            await WriteAsync(key, JsonSerializer.Serialize(extraction, Json), ct);
        }

        return extraction;
    }

    public Task<string?> AskJsonAsync(string system, string user, JsonElement schema, int maxTokens, CancellationToken ct) =>
        AskJsonWithFilesAsync(system, user, [], schema, maxTokens, ct);

    public async Task<string?> AskJsonWithFilesAsync(string system, string user, IReadOnlyList<ExtractionFile> files, JsonElement schema, int maxTokens, CancellationToken ct)
    {
        if (Asker is not { } asker)
        {
            return null;
        }

        var key = Key("j", inner.GetType().Name, $"{system}\n\u0001{user}\n\u0001{schema.GetRawText()}\n\u0001{maxTokens}", files);
        if (await ReadAsync(key, JsonTtl, ct) is { } cached)
        {
            return cached;
        }

        var json = files.Count == 0 ? await asker.AskJsonAsync(system, user, schema, maxTokens, ct) : await asker.AskJsonWithFilesAsync(system, user, files, schema, maxTokens, ct);
        if (!string.IsNullOrWhiteSpace(json))
        {
            await WriteAsync(key, json, ct);
        }

        return json;
    }

    /// <summary>«ai:x:…» o «ai:j:…»: la huella de todo lo que se manda (y del proveedor), nunca el contenido.</summary>
    public static string Key(string kind, string provider, string? text, IReadOnlyList<ExtractionFile> files)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData(Encoding.UTF8.GetBytes($"{Version}\u0001{provider}\u0001{text}"));
        foreach (var file in files)
        {
            hash.AppendData(Encoding.UTF8.GetBytes($"\u0002{file.Mime}\u0002"));
            hash.AppendData(file.Bytes);
        }

        return $"ai:{kind}:{Convert.ToHexString(hash.GetHashAndReset())}";
    }

    private async Task<string?> ReadAsync(string key, TimeSpan ttl, CancellationToken ct)
    {
        if (Bypass.Value)
        {
            return null;
        }

        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var since = DateTimeOffset.UtcNow.Add(-ttl).ToUnixTimeMilliseconds();
            var row = await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(a => a.Key == key && a.UpdatedMs >= since, ct);
            if (row is not null)
            {
                log.LogInformation("Respuesta de IA desde la caché ({Key}).", key[..12]);
            }

            return row?.Value;
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogWarning("Caché de IA no disponible: {Error}", e.Message);
            return null;
        }
    }

    private async Task WriteAsync(string key, string value, CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == key, ct);
            row ??= db.AppSettings.Add(new AppSetting { Key = key, Value = "" }).Entity;
            row.Value = value;
            row.UpdatedMs = now;

            // De vez en cuando se borra lo caducado, para que la caché no crezca sin fin.
            if (Random.Shared.Next(50) == 0)
            {
                var oldest = DateTimeOffset.UtcNow.Add(-ExtractionTtl).ToUnixTimeMilliseconds();
                var oldJson = DateTimeOffset.UtcNow.Add(-JsonTtl).ToUnixTimeMilliseconds();
                db.AppSettings.RemoveRange(db.AppSettings.Where(a =>
                    (a.Key.StartsWith("ai:x:") && a.UpdatedMs < oldest) || (a.Key.StartsWith("ai:j:") && a.UpdatedMs < oldJson)));
            }

            await db.SaveChangesAsync(ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogWarning("No se ha podido guardar en la caché de IA: {Error}", e.Message);
        }
    }
}

public static class AiCacheSetup
{
    /// <summary>Envuelve el proveedor de IA ya registrado con la caché.</summary>
    public static IServiceCollection AddAiCache(this IServiceCollection services)
    {
        var descriptor = services.Last(d => d.ServiceType == typeof(IBookingExtractor));
        services.Remove(descriptor);
        services.AddSingleton<IBookingExtractor>(provider =>
        {
            var inner = descriptor.ImplementationInstance as IBookingExtractor
                ?? descriptor.ImplementationFactory?.Invoke(provider) as IBookingExtractor
                ?? (IBookingExtractor)ActivatorUtilities.CreateInstance(provider, descriptor.ImplementationType!);
            return inner.IsAvailable
                ? new CachedAi(inner, provider.GetRequiredService<IServiceScopeFactory>(), provider.GetRequiredService<ILogger<CachedAi>>())
                : inner;
        });
        return services;
    }
}
