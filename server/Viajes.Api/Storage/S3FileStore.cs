using System.Net;
using Amazon.S3;
using Amazon.S3.Model;

namespace Viajes.Api.Storage;

public sealed class S3FileStore(IAmazonS3 s3, string bucket) : IFileStore
{
    public async Task WriteAsync(string key, Stream content, string contentType, CancellationToken ct)
    {
        // Se lee entero (máx. 20 MB): el SDK necesita un flujo con longitud conocida.
        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, ct);
        buffer.Position = 0;

        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = bucket,
            Key = key,
            InputStream = buffer,
            ContentType = contentType,
            AutoCloseStream = false,
        }, ct);
    }

    public async Task<StoredFile?> OpenReadAsync(string key, CancellationToken ct)
    {
        try
        {
            var response = await s3.GetObjectAsync(bucket, key, ct);
            return new StoredFile(response.ResponseStream, response.Headers.ContentType);
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }
}
