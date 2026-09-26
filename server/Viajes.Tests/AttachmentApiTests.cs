using System.Net;

namespace Viajes.Tests;

public sealed class AttachmentApiTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Metadata_then_content_then_download_round_trips()
    {
        var api = await TripsApi.SignUp(app, "adjunto1@example.com");
        var (tripId, bookingId, attachmentId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await api.PutTrip(tripId);
        await api.PutBooking(bookingId, tripId);
        var bytes = new byte[3_000_000];
        Random.Shared.NextBytes(bytes);

        var meta = await api.PutAttachment(attachmentId, bookingId, size: bytes.Length, qrText: "M1ABCDEF");
        var pending = (await api.GetSync()).Attachments.Single();
        var upload = await api.PutContent(attachmentId, bytes);
        var uploaded = (await api.GetSync()).Attachments.Single();
        var download = await api.GetContent(attachmentId);

        Assert.Equal(HttpStatusCode.NoContent, meta.StatusCode);
        Assert.False(pending.Uploaded);
        Assert.Equal("M1ABCDEF", pending.QrText);
        Assert.Equal(HttpStatusCode.NoContent, upload.StatusCode);
        Assert.True(uploaded.Uploaded);
        Assert.True(uploaded.Version > pending.Version);
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal("application/pdf", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal(bytes, await download.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Content_of_a_not_yet_uploaded_attachment_is_404()
    {
        var api = await TripsApi.SignUp(app, "adjunto2@example.com");
        var (tripId, bookingId, attachmentId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await api.PutTrip(tripId);
        await api.PutBooking(bookingId, tripId);
        await api.PutAttachment(attachmentId, bookingId);

        Assert.Equal(HttpStatusCode.NotFound, (await api.GetContent(attachmentId)).StatusCode);
    }

    [Fact]
    public async Task More_than_20_MB_is_rejected_in_metadata_and_in_content()
    {
        var api = await TripsApi.SignUp(app, "adjunto3@example.com");
        var (tripId, bookingId, attachmentId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await api.PutTrip(tripId);
        await api.PutBooking(bookingId, tripId);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await api.PutAttachment(Guid.NewGuid(), bookingId, size: 20_000_001)).StatusCode);

        await api.PutAttachment(attachmentId, bookingId, size: 1);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await api.PutContent(attachmentId, new byte[20_000_001])).StatusCode);
    }

    [Fact]
    public async Task Another_user_gets_404_for_my_attachment_and_its_file()
    {
        var ana = await TripsApi.SignUp(app, "ana-adjunto@example.com");
        var bea = await TripsApi.SignUp(app, "bea-adjunto@example.com");
        var (tripId, bookingId, attachmentId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await ana.PutTrip(tripId);
        await ana.PutBooking(bookingId, tripId);
        await ana.PutAttachment(attachmentId, bookingId);
        await ana.PutContent(attachmentId, [1, 2, 3]);

        Assert.Equal(HttpStatusCode.NotFound, (await bea.GetContent(attachmentId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.PutAttachment(attachmentId, bookingId, name: "otro.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.PutContent(attachmentId, [9])).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.DeleteAttachment(attachmentId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bea.PutAttachment(Guid.NewGuid(), bookingId)).StatusCode);
        Assert.Equal(new byte[] { 1, 2, 3 }, await (await ana.GetContent(attachmentId)).Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Deleting_an_attachment_removes_the_file_and_marks_the_row()
    {
        var api = await TripsApi.SignUp(app, "adjunto4@example.com");
        var (tripId, bookingId, attachmentId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await api.PutTrip(tripId);
        await api.PutBooking(bookingId, tripId);
        await api.PutAttachment(attachmentId, bookingId);
        await api.PutContent(attachmentId, [1, 2, 3]);
        var synced = (await api.GetSync()).Version;

        var response = await api.DeleteAttachment(attachmentId);
        var sync = await api.GetSync(synced);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.NotNull(sync.Attachments.Single().DeletedAtMs);
        Assert.Equal(HttpStatusCode.NotFound, (await api.GetContent(attachmentId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await api.PutAttachment(attachmentId, bookingId, name: "vuelve.pdf")).StatusCode);
        Assert.Empty(Directory.GetFiles(Path.Combine(app.DataDir, "files"), attachmentId.ToString(), SearchOption.AllDirectories));
    }

    [Fact]
    public async Task Html_uploads_are_never_served_as_html()
    {
        var api = await TripsApi.SignUp(app, "adjunto5@example.com");
        var (tripId, bookingId, attachmentId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await api.PutTrip(tripId);
        await api.PutBooking(bookingId, tripId);
        await api.PutAttachment(attachmentId, bookingId, name: "malo.html", mime: "text/html");
        await api.PutContent(attachmentId, "<script>alert(1)</script>"u8.ToArray(), "text/html");

        var download = await api.GetContent(attachmentId);

        Assert.Equal("application/octet-stream", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", download.Headers.GetValues("X-Content-Type-Options").Single());
    }
}
