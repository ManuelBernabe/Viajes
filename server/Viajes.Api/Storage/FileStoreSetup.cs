using Amazon.Runtime;
using Amazon.S3;

namespace Viajes.Api.Storage;

public static class FileStoreSetup
{
    public static IServiceCollection AddFileStore(this IServiceCollection services, IConfiguration config, string dataDir)
    {
        if (!string.Equals(config["FILE_STORE"], "s3", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IFileStore>(new LocalFileStore(Path.Combine(dataDir, "files")));
            return services;
        }

        var client = new AmazonS3Client(
            new BasicAWSCredentials(config["S3_ACCESS_KEY"], config["S3_SECRET_KEY"]),
            new AmazonS3Config
            {
                ServiceURL = config["S3_ENDPOINT"],
                ForcePathStyle = true,
                AuthenticationRegion = config["S3_REGION"] ?? "auto",
                // Las sumas de verificación por defecto del SDK no las aceptan todos los servicios compatibles con S3.
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
            });
        services.AddSingleton<IFileStore>(new S3FileStore(client, config["S3_BUCKET"]!));
        return services;
    }
}
