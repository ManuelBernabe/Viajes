using Viajes.Api.Storage;

namespace Viajes.Tests;

public sealed class LocalFileStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "viajes-files", Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task An_interrupted_write_keeps_the_previous_file()
    {
        var store = new LocalFileStore(_root);
        await store.WriteAsync("diag/u1/probe", new MemoryStream([1, 2, 3]), "application/pdf", CancellationToken.None);

        await Assert.ThrowsAsync<IOException>(() =>
            store.WriteAsync("diag/u1/probe", new StreamCutMidway(), "image/png", CancellationToken.None));

        var file = await store.OpenReadAsync("diag/u1/probe", CancellationToken.None);
        await using var content = file!.Content;
        using var copy = new MemoryStream();
        await content.CopyToAsync(copy);
        Assert.Equal([1, 2, 3], copy.ToArray());
        Assert.Equal("application/pdf", file.ContentType);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // Carpeta temporal: no debe tumbar la batería.
        }
    }

    // Simula una subida cortada: entrega unos bytes y luego falla.
    private sealed class StreamCutMidway : Stream
    {
        private bool _sentSome;

        public override bool CanRead => true;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (_sentSome)
            {
                throw new IOException("Conexión cortada.");
            }

            _sentSome = true;
            buffer[offset] = 9;
            return 1;
        }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (_sentSome)
            {
                throw new IOException("Conexión cortada.");
            }

            _sentSome = true;
            buffer.Span[0] = 9;
            return ValueTask.FromResult(1);
        }

        public override void Flush()
        {
        }

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
