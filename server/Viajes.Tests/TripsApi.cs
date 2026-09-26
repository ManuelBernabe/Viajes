using System.Net.Http.Json;

namespace Viajes.Tests;

/// <summary>Un cliente con sesión y atajos para las rutas del Plan 1.</summary>
public sealed class TripsApi(HttpClient client)
{
    public HttpClient Client { get; } = client;

    public static async Task<TripsApi> SignUp(TestApp app, string email)
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, email);
        return new TripsApi(client);
    }

    public Task<HttpResponseMessage> PutTrip(Guid id, string title = "Viaje", string? destination = null, string? start = null, string? end = null) =>
        Client.PutAsJsonAsync($"/api/trips/{id}", new { title, destination, startDate = start, endDate = end });

    public Task<HttpResponseMessage> DeleteTrip(Guid id) => Client.DeleteAsync($"/api/trips/{id}");

    public Task<HttpResponseMessage> PutBooking(Guid id, Guid tripId, object? overrides = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["tripId"] = tripId,
            ["type"] = "flight",
            ["title"] = "Vuelo a Tokio",
            ["startLocal"] = "2026-10-12T10:05",
            ["startTz"] = "Europe/Madrid",
            ["startPlace"] = "MAD",
            ["endLocal"] = "2026-10-13T08:55",
            ["endTz"] = "Asia/Tokyo",
            ["endPlace"] = "HND",
            ["reference"] = "ABC123",
            ["address"] = null,
            ["notes"] = null,
            ["changeNote"] = null,
        };
        if (overrides is not null)
        {
            foreach (var property in overrides.GetType().GetProperties())
            {
                body[property.Name] = property.GetValue(overrides);
            }
        }

        return Client.PutAsJsonAsync($"/api/bookings/{id}", body);
    }

    public Task<HttpResponseMessage> DeleteBooking(Guid id) => Client.DeleteAsync($"/api/bookings/{id}");

    public Task<HttpResponseMessage> PutAttachment(Guid id, Guid bookingId, string name = "tarjeta.pdf", string mime = "application/pdf", long size = 3, string? qrText = null) =>
        Client.PutAsJsonAsync($"/api/attachments/{id}", new { bookingId, name, mime, size, qrText });

    public Task<HttpResponseMessage> PutContent(Guid id, byte[] bytes, string mime = "application/pdf")
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(mime);
        return Client.PutAsync($"/api/attachments/{id}/content", content);
    }

    public Task<HttpResponseMessage> GetContent(Guid id) => Client.GetAsync($"/api/attachments/{id}/content");

    public Task<HttpResponseMessage> DeleteAttachment(Guid id) => Client.DeleteAsync($"/api/attachments/{id}");

    public async Task<Sync> GetSync(long since = 0) =>
        (await Client.GetFromJsonAsync<Sync>($"/api/sync?since={since}"))!;

    public async Task<SyncFull> GetSyncFull(long since = 0) =>
        (await Client.GetFromJsonAsync<SyncFull>($"/api/sync?since={since}"))!;

    public sealed record Sync(long Version, List<Guid> TripIds, List<TripRow> Trips, List<BookingRow> Bookings, List<AttachmentRow> Attachments);

    public sealed record SyncFull(long Version, List<Guid> TripIds, List<TripRow> Trips, List<BookingRow> Bookings, List<AttachmentRow> Attachments, List<InboxRow> Inbox);

    public sealed record InboxRow(
        Guid Id, string FromAddress, string Subject, long ReceivedMs, string? SuggestedType, string? SuggestedTitle,
        string? SuggestedStartLocal, string? SuggestedStartTz, string? SuggestedStartPlace, string? SuggestedEndLocal, string? SuggestedEndTz,
        string? SuggestedEndPlace, string? SuggestedReference, string? SuggestedAddress, string? BodyText, string Status, Guid? BookingId,
        List<InboxAttachmentRow> Attachments, long Version, long? DeletedAtMs);

    public sealed record InboxAttachmentRow(Guid Id, string Name, string Mime, long Size, string? QrText);

    public sealed record TripRow(Guid Id, string Title, string? Destination, string? StartDate, string? EndDate, long Version, long? DeletedAtMs);

    public sealed record BookingRow(Guid Id, Guid TripId, string Type, string Title, string StartLocal, string StartTz, string? EndLocal, string? EndTz, long StartUtcMs, string? Reference, string? ChangeNote, long Version, long? DeletedAtMs);

    public sealed record AttachmentRow(Guid Id, Guid BookingId, string Name, string Mime, long Size, string? QrText, bool Uploaded, long Version, long? DeletedAtMs);
}
