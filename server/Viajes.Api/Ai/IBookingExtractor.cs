using System.Text.Json;

namespace Viajes.Api.Ai;

/// <summary>Un fichero que acompaña a la petición de extracción: PDF o imagen de un billete o confirmación.</summary>
public sealed record ExtractionFile(string Name, string Mime, byte[] Bytes);

public sealed record ExtractionInput(string? Text, IReadOnlyList<ExtractionFile> Files);

/// <summary>Lo que el modelo propone para la reserva. Todo puede venir vacío: nunca se inventa nada.</summary>
public sealed record Extraction(
    string? Type,
    string? Title,
    string? Reference,
    string? StartLocal,
    string? StartTz,
    string? StartPlace,
    string? EndLocal,
    string? EndTz,
    string? EndPlace,
    string? Address,
    string? Notes);

public interface IBookingExtractor
{
    /// <summary>False cuando no hay clave configurada: la app usa entonces sus reglas locales.</summary>
    bool IsAvailable { get; }

    /// <summary>Null si no hay nada reconocible o si la llamada falla; el error queda en el log.</summary>
    Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct);
}

/// <summary>
/// Una pregunta de texto con respuesta JSON según un esquema, con el proveedor que haya configurado (Gemini, DeepSeek o
/// Claude). La usan las sugerencias de lugares; la lectura de reservas sigue con <see cref="IBookingExtractor"/>.
/// </summary>
public interface IJsonAsker
{
    bool IsAvailable { get; }

    /// <summary>El JSON de la respuesta, o null si no hay respuesta útil (el motivo queda en el log).</summary>
    Task<string?> AskJsonAsync(string system, string user, JsonElement schema, int maxTokens, CancellationToken ct);
}

/// <summary>Sin clave de API: no extrae nada.</summary>
public sealed class NoBookingExtractor : IBookingExtractor, IJsonAsker
{
    public bool IsAvailable => false;

    public Task<Extraction?> ExtractAsync(ExtractionInput input, CancellationToken ct) => Task.FromResult<Extraction?>(null);

    public Task<string?> AskJsonAsync(string system, string user, JsonElement schema, int maxTokens, CancellationToken ct) =>
        Task.FromResult<string?>(null);
}
