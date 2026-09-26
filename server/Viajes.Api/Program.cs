using Viajes.Api.Auth;
using Viajes.Api.Data;
using Viajes.Api.Diag;
using Viajes.Api.Hosting;
using Viajes.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
if (port is not null)
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

var dataDir = Path.GetFullPath(builder.Configuration["DATA_DIR"] ?? ".localdata");
Directory.CreateDirectory(dataDir);
var spa = SpaHosting.CreateProvider(builder.Configuration, builder.Environment);

builder.Services.AddViajesData(dataDir);
builder.Services.AddViajesAuth(builder.Configuration);
builder.Services.AddFileStore(builder.Configuration, dataDir);

var app = builder.Build();

app.MigrateDatabase();

app.UseMiddleware<OriginCheckMiddleware>();
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = spa });
app.UseStaticFiles(SpaHosting.StaticOptions(spa));
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapAuthEndpoints();
app.MapDiagEndpoints();
app.Map("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html", SpaHosting.StaticOptions(spa));

app.Run();

public partial class Program;
