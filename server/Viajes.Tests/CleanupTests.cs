using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Viajes.Api.Data;
using Viajes.Api.Maintenance;
using Viajes.Api.Storage;

namespace Viajes.Tests;

public sealed class CleanupTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task The_cleanup_removes_only_what_is_no_longer_needed()
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var store = scope.ServiceProvider.GetRequiredService<IFileStore>();
        var now = DateTimeOffset.UtcNow;
        long Ago(int days) => now.AddDays(-days).ToUnixTimeMilliseconds();
        var household = Guid.NewGuid();

        InboxItem Email(string status, int days) => new()
        {
            Id = Guid.NewGuid(), HouseholdId = household, ImportedBy = "x", MessageId = Guid.NewGuid().ToString(), FromAddress = "a@b.c",
            Subject = "Reserva", ReceivedMs = Ago(days), BodyText = "texto", RawFileKey = $"limpieza/{Guid.NewGuid():N}/raw", Status = status,
        };
        var oldDone = Email(InboxItem.Confirmed, 90);
        var oldPending = Email(InboxItem.Pending, 90);
        var recentDone = Email(InboxItem.Discarded, 5);
        db.InboxItems.AddRange(oldDone, oldPending, recentDone);
        foreach (var item in new[] { oldDone, oldPending, recentDone })
        {
            await store.WriteAsync(item.RawFileKey, new MemoryStream([1, 2, 3]), "message/rfc822", default);
        }

        var attachment = new InboxAttachment { Id = Guid.NewGuid(), InboxItemId = oldDone.Id, FileKey = $"limpieza/{Guid.NewGuid():N}/adjunto", Name = "b.pdf", Mime = "application/pdf", Size = 3 };
        db.InboxAttachments.Add(attachment);
        await store.WriteAsync(attachment.FileKey, new MemoryStream([1, 2, 3]), "application/pdf", default);

        var oldQuestion = $"ai:j:{Guid.NewGuid():N}";
        var recentReading = $"ai:x:{Guid.NewGuid():N}";
        var oldReading = $"ai:x:{Guid.NewGuid():N}";
        db.AppSettings.AddRange(
            new AppSetting { Key = oldQuestion, Value = "{}", UpdatedMs = Ago(10) },
            new AppSetting { Key = recentReading, Value = "{}", UpdatedMs = Ago(10) },
            new AppSetting { Key = oldReading, Value = "{}", UpdatedMs = Ago(100) });
        db.ReminderLogs.Add(new ReminderLog { BookingId = Guid.NewGuid(), Kind = "eve", StartUtcMs = Ago(90), SentMs = Ago(91) });
        // (Ago() no se puede usar dentro de una consulta: se calcula antes.)
        await db.SaveChangesAsync();

        var result = await Cleanup.RunAsync(db, store, now, default);

        Assert.True(result.AiAnswers >= 2);
        Assert.False(await db.AppSettings.AnyAsync(a => a.Key == oldQuestion));
        Assert.False(await db.AppSettings.AnyAsync(a => a.Key == oldReading));
        Assert.True(await db.AppSettings.AnyAsync(a => a.Key == recentReading));
        Assert.Null(await store.OpenReadAsync(oldDone.RawFileKey, default));
        Assert.Null(await store.OpenReadAsync(attachment.FileKey, default));
        Assert.NotNull(await store.OpenReadAsync(oldPending.RawFileKey, default));
        Assert.NotNull(await store.OpenReadAsync(recentDone.RawFileKey, default));
        Assert.False(await db.InboxAttachments.AnyAsync(a => a.Id == attachment.Id));
        // La ficha del correo se queda (evita importarlo dos veces), sin el texto.
        var kept = await db.InboxItems.AsNoTracking().SingleAsync(i => i.Id == oldDone.Id);
        Assert.Null(kept.BodyText);
        var oldLog = Ago(90);
        Assert.False(await db.ReminderLogs.AnyAsync(r => r.StartUtcMs == oldLog));
    }
}
