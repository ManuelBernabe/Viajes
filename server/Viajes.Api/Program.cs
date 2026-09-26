using Microsoft.AspNetCore.HttpOverrides;
using Viajes.Api.Auth;
using Viajes.Api.Data;
using Viajes.Api.Diag;
using Viajes.Api.Hosting;
using Viajes.Api.Storage;
using Viajes.Api.Trips;

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
builder.Services.AddSingleton<VersionInfo>();

// Railway pone dos saltos en X-Forwarded-For (cliente, borde); con el límite por defecto de uno
// la IP «remota» sería la del borde y el límite de intentos compartiría un contador para todos.
builder.Services.Configure<ForwardedHeadersOptions>(options => options.ForwardLimit = 2);

var app = builder.Build();

app.MigrateDatabase();

app.UseMiddleware<OriginCheckMiddleware>();
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = spa });
app.UseStaticFiles(SpaHosting.StaticOptions(spa));
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/version", (VersionInfo version) => Results.Ok(new
{
    commit = version.Commit,
    deploymentId = version.DeploymentId,
    startedAt = version.StartedAt,
}));
app.MapAuthEndpoints();
app.MapDiagEndpoints();
app.MapTripEndpoints();
app.Map("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html", SpaHosting.StaticOptions(spa));

app.Run();

public partial class Program;
