using Microsoft.EntityFrameworkCore;
using Viajes.Api.Ai;
using Viajes.Api.Data;
using Viajes.Api.Storage;

namespace Viajes.Api.Maintenance;

/// <summary>
/// Limpieza diaria, para que la base de datos y el volumen de Railway no crezcan sin fin. Solo borra lo que ya no sirve:
/// - respuestas de la IA en caché ya caducadas;
/// - de los correos ya tratados (aceptados o descartados) hace más de 60 días, el correo original y sus adjuntos (la
///   reserva ya tiene sus propias copias); se queda la ficha, que evita importar el mismo correo dos veces;
/// - registros de avisos y estados de vuelos de hace más de 60 días.
/// Nunca toca reservas, viajes, documentos, fotos ni adjuntos de reservas.
/// </summary>
public static class Cleanup
{
    public static readonly TimeSpan KeepTreatedEmails = TimeSpan.FromDays(60);
    public static readonly TimeSpan KeepLogs = TimeSpan.FromDays(60);

    public sealed record Result(int AiAnswers, int Emails, int EmailFiles, int ReminderLogs, int FlightStatuses);

    public static async Task<Result> RunAsync(AppDbContext db, IFileStore store, DateTimeOffset now, CancellationToken ct)
    {
        var aiExtract = now.Add(-CachedAi.ExtractionTtl).ToUnixTimeMilliseconds();
        var aiJson = now.Add(-CachedAi.JsonTtl).ToUnixTimeMilliseconds();
        var ai = await db.AppSettings
            .Where(a => (a.Key.StartsWith("ai:x:") && a.UpdatedMs < aiExtract) || (a.Key.StartsWith("ai:j:") && a.UpdatedMs < aiJson))
            .ExecuteDeleteAsync(ct);

        var emailCutoff = now.Add(-KeepTreatedEmails).ToUnixTimeMilliseconds();
        var emails = await db.InboxItems
            .Where(i => i.ReceivedMs < emailCutoff && (i.Status != InboxItem.Pending || i.DeletedAtMs != null) && (i.BodyText != null || i.RawFileKey != ""))
            .ToListAsync(ct);
        var files = 0;
        foreach (var item in emails)
        {
            var attachments = await db.InboxAttachments.Where(a => a.InboxItemId == item.Id).ToListAsync(ct);
            foreach (var attachment in attachments)
            {
                await Delete(store, attachment.FileKey, ct);
                files++;
            }

            db.InboxAttachments.RemoveRange(attachments);
            if (item.RawFileKey != "")
            {
                await Delete(store, item.RawFileKey, ct);
                files++;
                item.RawFileKey = "";
            }

            item.BodyText = null;
        }

        await db.SaveChangesAsync(ct);

        var logCutoff = now.Add(-KeepLogs).ToUnixTimeMilliseconds();
        var reminders = await db.ReminderLogs.Where(r => r.StartUtcMs < logCutoff).ExecuteDeleteAsync(ct);
        var flights = await db.FlightStatuses.Where(f => f.FetchedMs < logCutoff).ExecuteDeleteAsync(ct);
        return new Result(ai, emails.Count, files, reminders, flights);
    }

    private static async Task Delete(IFileStore store, string key, CancellationToken ct)
    {
        try
        {
            await store.DeleteAsync(key, ct);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException)
        {
            // Un fichero que no se puede borrar no para la limpieza.
        }
    }
}

/// <summary>Pasa la limpieza una vez al día (la primera, un rato después de arrancar).</summary>
public sealed class CleanupService(IServiceProvider services, ILogger<CleanupService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = services.CreateScope();
                    var result = await Cleanup.RunAsync(
                        scope.ServiceProvider.GetRequiredService<AppDbContext>(), scope.ServiceProvider.GetRequiredService<IFileStore>(), DateTimeOffset.UtcNow, stoppingToken);
                    log.LogInformation("Limpieza: {Result}", result);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    log.LogWarning(e, "La limpieza ha fallado; se reintenta mañana.");
                }

                await Task.Delay(TimeSpan.FromDays(1), stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Parada del servidor.
        }
    }
}
