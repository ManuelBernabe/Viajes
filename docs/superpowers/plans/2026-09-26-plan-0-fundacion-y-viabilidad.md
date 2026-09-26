# Plan 0 — Fundación y prueba de viabilidad en iPhone (Railway)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar montado el repositorio (PWA + servicio .NET con SQLite) desplegado en Railway, con una página de diagnóstico que compruebe en el iPhone real, con la app instalada, las capacidades de las que depende el diseño.

**Architecture:** Un único servicio ASP.NET Core (.NET 10) que sirve la PWA (Vite + React + TS, compilada en su `wwwroot`) y una API en `/api` desde el mismo dominio. SQLite en un volumen (`DATA_DIR`), Identity con cookie de sesión, almacenamiento de ficheros intercambiable (volumen local o bucket S3). La lógica comprobable vive en módulos pequeños con tests; los componentes y endpoints solo la conectan.

**Tech Stack:** .NET 10 (ASP.NET Core, EF Core + SQLite, Identity, AWSSDK.S3), xUnit + `Microsoft.AspNetCore.Mvc.Testing`; Node 22, Vite, React, TypeScript, Vitest, `vite-plugin-pwa` + `@vite-pwa/assets-generator`, `idb`, `fake-indexeddb`; Docker; Railway (CLI vía `npx`).

**Spec:** `docs/superpowers/specs/2026-09-26-app-viajes-design.md`, revisión 2 (este plan implementa su sección 13 y la base de las secciones 3, 5 y 6).

## Hoja de ruta

Cada plan se escribe **cuando el anterior termina**, con lo aprendido:

| Plan | Contenido | Depende de |
|---|---|---|
| **0 — Fundación y viabilidad** (este) | Repositorio, servicio en Railway, página de diagnóstico, prueba en iPhone | — |
| 1 — Viajes y reservas | **Sistema de diseño**, hogar con administrador, viajes, reservas con zona horaria, adjuntos, QR, Litestream y prueba de restauración | Plan 0 superado |
| 2 — Compartir | Roles y permisos, invitaciones de miembros e invitados | Plan 1 |
| 3 — Sin conexión | Sincronización por versiones, cola de pendientes **ligada al usuario** (que los cambios sin enviar de uno nunca se envíen con la sesión de otro), descarga de adjuntos, indicador | Plan 1 y comprobaciones a 8 días |
| 4 — Caja fuerte | Cifrado, frase, PIN, pantallas de la caja fuerte | Plan 2 |
| 5 — Importar desde Gmail | Apps Script, bandeja de entrada, extracción de `.pkpass` y JSON-LD | Planes 1 a 4 |

## Global Constraints

- Plataforma objetivo: **iPhone, con la app instalada en la pantalla de inicio**; se desarrolla solo desde Windows.
- **Un único servicio** en Railway que sirve la app y la API **desde el mismo dominio**; **una sola instancia** (el volumen solo se monta en una).
- SDK **.NET 10** (`global.json` con `10.0.300` y `rollForward: latestFeature`); Node **22**.
- Sesión: cookie **`HttpOnly`, `Secure`, `SameSite=Strict`**, caducidad deslizante de **60 días**; la API responde **401**, nunca redirige.
- Datos en **`DATA_DIR`** (en Railway, `/data`, un volumen): la base `viajes.db` en modo **WAL**, las claves de Data Protection en `keys/` y los ficheros locales en `files/`.
- Adjuntos de **20 MB como máximo** (20.000.000 bytes).
- Textos de la interfaz y mensajes de error de la API **en español**; identificadores del código en inglés.
- **Diseño visual profesional y eficaz**, petición expresa de Manuel: se define en el Plan 1 con un sistema de diseño propio. La página de diagnóstico de este plan es **desechable** y solo cuida la legibilidad.
- **Nunca** la palabra «claude» en código, tests ni datos de prueba.
- Secretos **solo** en variables de entorno de Railway; nunca en el repositorio.
- Los commits los hace **Manuel**, a mano: cada tarea acaba en un «punto de commit» con el mensaje propuesto **en inglés** y **sin** línea `Co-Authored-By`.
- Criterio de rendimiento de la sección 13: PBKDF2-SHA-256 con **600.000 iteraciones en menos de 2 s** en el iPhone.

## Review Focus

1. **Un despliegue nuevo no debe cerrar la sesión de nadie.** Si las claves de Data Protection no viven en el volumen, cada despliegue invalida todas las cookies y la sesión de 60 días no existe. → Test «las claves se guardan en `DATA_DIR`» (Tarea 3) y fila R4 de la prueba en iPhone (Tarea 7).
2. **El volumen de Railway pertenece a root** y la imagen de .NET corre sin privilegios: sin arreglarlo, el servicio no arranca (no puede crear la base). → `RAILWAY_RUN_UID=0` en la Tarea 6, con comprobación del arranque.
3. **Una ruta `/api/...` inexistente debe dar 404, no la página de la app.** Si devolviera `index.html` con 200, el cliente intentaría leer HTML como JSON. → Test en la Tarea 2.
4. **Una operación reenviada tras un corte de red no se duplica.** El servidor pudo aplicarla y perderse la respuesta. → Test de idempotencia en la Tarea 4 y cola del cliente en la Tarea 5.
5. **Con la sesión caducada, la cola de pendientes no se pierde.** Un 401 debe dejar la operación en la cola, no descartarla. → Test de `toSendResult` en la Tarea 5.

---

### Task 1: Repositorio base con tests en servidor y cliente

**Files:**
- Create: `global.json`, `.gitignore`, `server/Viajes.slnx`, `server/Viajes.Api/` (plantilla `web`), `server/Viajes.Tests/` (plantilla `xunit`), `web/` (plantilla Vite `react-ts`)
- Modify: `server/Viajes.Api/Program.cs`, `web/vite.config.ts`, `web/package.json`
- Test: `server/Viajes.Tests/TestApp.cs`, `server/Viajes.Tests/HealthTests.cs`, `web/src/smoke.test.ts`

**Interfaces:**
- Produces: `GET /api/health` → `200 {"status":"ok"}`; la clase de pruebas `TestApp` (factoría con `DataDir`, `SpaDir`, `CreateHttpsClient()` y la propiedad `AuthRateLimit`), que usan todas las tareas del servidor; scripts `npm test` y `npm run build` en `web/`.

- [ ] **Step 1: Crear la estructura**

```powershell
cd C:\Projects\Viajes
git init
dotnet new globaljson --sdk-version 10.0.300 --roll-forward latestFeature
dotnet new sln -n Viajes -o server --format slnx
dotnet new web -n Viajes.Api -o server/Viajes.Api -f net10.0
dotnet new xunit -n Viajes.Tests -o server/Viajes.Tests -f net10.0
dotnet sln server/Viajes.slnx add server/Viajes.Api server/Viajes.Tests
dotnet add server/Viajes.Tests reference server/Viajes.Api
dotnet add server/Viajes.Tests package Microsoft.AspNetCore.Mvc.Testing
npm create vite@latest web -- --template react-ts
cd web
npm install
npm install -D vitest
cd ..
```

Borrar `server/Viajes.Tests/UnitTest1.cs`.

- [ ] **Step 2: `.gitignore` en la raíz**

```
bin/
obj/
node_modules/
server/Viajes.Api/wwwroot/
.localdata/
dev-dist/
*.db
*.db-shm
*.db-wal
.env*
!.env.example
```

- [ ] **Step 3: La factoría de pruebas**

`server/Viajes.Tests/TestApp.cs`:

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Viajes.Tests;

public class TestApp : WebApplicationFactory<Program>
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "viajes-tests", Guid.NewGuid().ToString("N"));

    public string DataDir => Path.Combine(_root, "data");

    public string SpaDir => Path.Combine(_root, "spa");

    public const string RegistrationCode = "codigo-de-prueba";

    protected int AuthRateLimit { get; set; } = 1000;

    public HttpClient CreateHttpsClient(bool handleCookies = true) =>
        CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = handleCookies,
        });

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Directory.CreateDirectory(SpaDir);
        File.WriteAllText(Path.Combine(SpaDir, "index.html"), "<!doctype html><title>Viajes</title>");

        builder.UseSetting("DATA_DIR", DataDir);
        builder.UseSetting("SPA_DIR", SpaDir);
        builder.UseSetting("REGISTRATION_CODE", RegistrationCode);
        builder.UseSetting("AUTH_RATE_LIMIT", AuthRateLimit.ToString());
        builder.UseSetting("FILE_STORE", "local");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // Un fichero aún abierto no debe tumbar la batería; es una carpeta temporal.
        }
    }
}
```

La base se crea con `https://localhost` porque la cookie de sesión es `Secure` y el cliente de pruebas no la enviaría por `http`.

- [ ] **Step 4: Escribir el test que falla**

`server/Viajes.Tests/HealthTests.cs`:

```csharp
namespace Viajes.Tests;

public sealed class HealthTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Health_answers_ok()
    {
        var response = await app.CreateHttpsClient().GetAsync("/api/health");

        response.EnsureSuccessStatusCode();
        Assert.Contains("\"status\":\"ok\"", await response.Content.ReadAsStringAsync());
    }
}
```

- [ ] **Step 5: Ejecutar para ver que falla**

Run: `dotnet test server`
Expected: FAIL: la plantilla responde «Hello World!» en `/` y `/api/health` da 404.

- [ ] **Step 6: Implementar**

`server/Viajes.Api/Program.cs` (sustituir el contenido):

```csharp
var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
if (port is not null)
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

var app = builder.Build();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.Run();

public partial class Program;
```

- [ ] **Step 7: Ejecutar para ver que pasa**

Run: `dotnet test server`
Expected: PASS, 1 test.

- [ ] **Step 8: Tests del cliente**

`web/src/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('entorno de tests', () => {
  it('dispone de Web Crypto', () => {
    expect(globalThis.crypto?.subtle).toBeDefined();
  });
});
```

`web/vite.config.ts` (sustituir el contenido):

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

En `web/package.json`, dentro de `"scripts"`, añadir `"test": "vitest run"`.

Run: `npm test --prefix web` → Expected: PASS, 1 test.
Run: `npm run build --prefix web` → Expected: sin errores.

- [ ] **Step 9: Punto de commit (lo hace Manuel)**

```
Scaffold the .NET API, its tests and the Vite React client
```

---

### Task 2: El servicio sirve la app y separa la API

**Files:**
- Create: `server/Viajes.Api/Hosting/SpaHosting.cs`
- Modify: `server/Viajes.Api/Program.cs`
- Test: `server/Viajes.Tests/HostingTests.cs`

**Interfaces:**
- Consumes: `TestApp` (Tarea 1).
- Produces: `SpaHosting.CreateProvider(IConfiguration, IWebHostEnvironment): PhysicalFileProvider` y `SpaHosting.StaticOptions(IFileProvider): StaticFileOptions`; configuración `DATA_DIR` (por defecto `.localdata`; **no** `data`, porque en Windows git no distingue mayúsculas y ignoraría también la carpeta de código `Data/`) y `SPA_DIR` (por defecto `wwwroot` del proyecto).

- [ ] **Step 1: Escribir los tests que fallan**

`server/Viajes.Tests/HostingTests.cs`:

```csharp
using System.Net;

namespace Viajes.Tests;

public sealed class HostingTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Any_app_route_serves_the_spa()
    {
        var response = await app.CreateHttpsClient().GetAsync("/viaje/123");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<title>Viajes</title>", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unknown_api_route_is_404_not_the_spa()
    {
        var response = await app.CreateHttpsClient().GetAsync("/api/no-existe");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("<title>", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Uses_the_data_dir_from_configuration()
    {
        await app.CreateHttpsClient().GetAsync("/api/health");

        Assert.True(Directory.Exists(app.DataDir));
    }
}
```

El tercer test protege una suposición de la que dependen los demás: que la configuración que pone la factoría llega a `Program.cs`.

- [ ] **Step 2: Ejecutar para ver que fallan**

Run: `dotnet test server`
Expected: FAIL en los tres tests nuevos.

- [ ] **Step 3: Implementar**

`server/Viajes.Api/Hosting/SpaHosting.cs`:

```csharp
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;

namespace Viajes.Api.Hosting;

public static class SpaHosting
{
    // Ficheros que deciden qué versión de la app corre: nunca de caché, o el iPhone no se actualizaría.
    private static readonly HashSet<string> NoCache =
        ["index.html", "sw.js", "registerSW.js", "manifest.webmanifest"];

    public static PhysicalFileProvider CreateProvider(IConfiguration config, IWebHostEnvironment env)
    {
        var dir = Path.GetFullPath(config["SPA_DIR"] ?? Path.Combine(env.ContentRootPath, "wwwroot"));
        Directory.CreateDirectory(dir);
        return new PhysicalFileProvider(dir);
    }

    public static StaticFileOptions StaticOptions(IFileProvider provider) => new()
    {
        FileProvider = provider,
        ContentTypeProvider = new FileExtensionContentTypeProvider
        {
            Mappings = { [".webmanifest"] = "application/manifest+json" },
        },
        OnPrepareResponse = context =>
        {
            if (NoCache.Contains(context.File.Name))
            {
                context.Context.Response.Headers.CacheControl = "no-cache";
            }
        },
    };
}
```

`server/Viajes.Api/Program.cs`:

```csharp
using Viajes.Api.Hosting;

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
if (port is not null)
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

var dataDir = Path.GetFullPath(builder.Configuration["DATA_DIR"] ?? ".localdata");
Directory.CreateDirectory(dataDir);
var spa = SpaHosting.CreateProvider(builder.Configuration, builder.Environment);

var app = builder.Build();

app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = spa });
app.UseStaticFiles(SpaHosting.StaticOptions(spa));

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.Map("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html", SpaHosting.StaticOptions(spa));

app.Run();

public partial class Program;
```

- [ ] **Step 4: Ejecutar para ver que pasan**

Run: `dotnet test server`
Expected: PASS, 4 tests.

- [ ] **Step 5: Punto de commit (lo hace Manuel)**

```
Serve the SPA from the API and keep unknown API routes as 404
```

---

### Task 3: SQLite, cuentas y sesión

**Files:**
- Create: `server/Viajes.Api/Data/AppDbContext.cs`, `server/Viajes.Api/Data/DiagMark.cs`, `server/Viajes.Api/Data/DataSetup.cs`
- Create: `server/Viajes.Api/Auth/AuthSetup.cs`, `server/Viajes.Api/Auth/AuthEndpoints.cs`, `server/Viajes.Api/Auth/IdentityMessages.cs`, `server/Viajes.Api/Hosting/OriginCheckMiddleware.cs`
- Create: `server/Viajes.Api/Data/Migrations/*` (generado)
- Modify: `server/Viajes.Api/Program.cs`, `server/Viajes.Tests/TestApp.cs`
- Test: `server/Viajes.Tests/AuthTests.cs`, `server/Viajes.Tests/Auth.cs`

**Interfaces:**
- Consumes: `TestApp`, `SpaHosting`.
- Produces: `AppDbContext` (Identity + `DbSet<DiagMark> DiagMarks`); `DataSetup.AddViajesData(this IServiceCollection, string dataDir)` y `DataSetup.MigrateDatabase(this WebApplication)`; `AuthSetup.AddViajesAuth(this IServiceCollection, IConfiguration)`; endpoints `POST /api/auth/register {email,password,code}`, `POST /api/auth/login {email,password}`, `POST /api/auth/logout`, `GET /api/auth/me` → `{email}`; ayudante de pruebas `Auth.RegisterAsync(HttpClient, string email)`.

- [ ] **Step 1: Paquetes y herramienta de migraciones**

```powershell
dotnet add server/Viajes.Api package Microsoft.AspNetCore.Identity.EntityFrameworkCore
dotnet add server/Viajes.Api package Microsoft.EntityFrameworkCore.Sqlite
dotnet add server/Viajes.Api package Microsoft.EntityFrameworkCore.Design
dotnet new tool-manifest
dotnet tool install dotnet-ef --version 10.*
```

- [ ] **Step 2: Escribir los tests que fallan**

`server/Viajes.Tests/Auth.cs`:

```csharp
using System.Net.Http.Json;

namespace Viajes.Tests;

public static class Auth
{
    public const string Password = "Viajes2026ok";

    public static async Task RegisterAsync(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { email, password = Password, code = TestApp.RegistrationCode });
        response.EnsureSuccessStatusCode();
    }
}
```

`server/Viajes.Tests/AuthTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;

namespace Viajes.Tests;

public sealed class AuthTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Register_requires_the_registration_code()
    {
        var response = await app.CreateHttpsClient().PostAsJsonAsync(
            "/api/auth/register",
            new { email = "sin-codigo@example.com", password = Auth.Password, code = "otro" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("código de registro", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Registered_user_is_signed_in()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "ana@example.com");

        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me");

        Assert.Equal("ana@example.com", me!.Email);
    }

    [Fact]
    public async Task Session_cookie_is_httponly_secure_strict_and_persistent()
    {
        var client = app.CreateHttpsClient(handleCookies: false);

        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { email = "cookie@example.com", password = Auth.Password, code = TestApp.RegistrationCode });

        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith("viajes_session="))
            .ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("expires=", cookie);
    }

    [Fact]
    public async Task Wrong_password_is_401_with_a_spanish_message()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "luis@example.com");

        var response = await app.CreateHttpsClient().PostAsJsonAsync(
            "/api/auth/login", new { email = "luis@example.com", password = "incorrecta-123" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Email o contraseña incorrectos.", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Five_wrong_passwords_lock_the_account()
    {
        await Auth.RegisterAsync(app.CreateHttpsClient(), "bloqueo@example.com");
        var client = app.CreateHttpsClient();
        for (var i = 0; i < 5; i++)
        {
            await client.PostAsJsonAsync("/api/auth/login", new { email = "bloqueo@example.com", password = "incorrecta-123" });
        }

        var response = await client.PostAsJsonAsync(
            "/api/auth/login", new { email = "bloqueo@example.com", password = Auth.Password });

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }

    [Fact]
    public async Task Me_without_session_is_401_not_a_redirect()
    {
        var response = await app.CreateHttpsClient().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Writes_from_another_origin_are_rejected()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "x@example.com", password = "x" }),
        };
        request.Headers.Add("Origin", "https://otro.example");

        var response = await app.CreateHttpsClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Data_protection_keys_live_in_the_data_dir()
    {
        await Auth.RegisterAsync(app.CreateHttpsClient(), "claves@example.com");

        Assert.NotEmpty(Directory.GetFiles(Path.Combine(app.DataDir, "keys"), "*.xml"));
    }

    private sealed record MeResponse(string Email);
}

public sealed class StrictRateLimitApp : TestApp
{
    public StrictRateLimitApp() => AuthRateLimit = 3;
}

public sealed class RateLimitTests(StrictRateLimitApp app) : IClassFixture<StrictRateLimitApp>
{
    [Fact]
    public async Task Too_many_auth_requests_are_429()
    {
        var client = app.CreateHttpsClient();
        for (var i = 0; i < 3; i++)
        {
            await client.PostAsJsonAsync("/api/auth/login", new { email = "x@example.com", password = "x" });
        }

        var response = await client.PostAsJsonAsync("/api/auth/login", new { email = "x@example.com", password = "x" });

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }
}
```

- [ ] **Step 3: Ejecutar para ver que fallan**

Run: `dotnet test server`
Expected: FAIL en los 9 tests nuevos (no existen los endpoints).

- [ ] **Step 4: Datos**

`server/Viajes.Api/Data/DiagMark.cs`:

```csharp
namespace Viajes.Api.Data;

public sealed class DiagMark
{
    public Guid Id { get; set; }

    public required string UserId { get; set; }

    public required string Local { get; set; }

    public long CreatedMs { get; set; }
}
```

`server/Viajes.Api/Data/AppDbContext.cs`:

```csharp
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Viajes.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<DiagMark> DiagMarks => Set<DiagMark>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<DiagMark>(mark =>
        {
            mark.HasKey(m => m.Id);
            mark.Property(m => m.Local).HasMaxLength(100);
            mark.HasIndex(m => m.UserId);
        });
    }
}
```

`server/Viajes.Api/Data/DataSetup.cs`:

```csharp
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Viajes.Api.Data;

public static class DataSetup
{
    public static IServiceCollection AddViajesData(this IServiceCollection services, string dataDir)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseSqlite($"Data Source={Path.Combine(dataDir, "viajes.db")}"));

        // En el volumen: si las claves cambiaran en cada despliegue, todas las sesiones caducarían.
        services.AddDataProtection()
            .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDir, "keys")))
            .SetApplicationName("viajes");

        return services;
    }

    public static void MigrateDatabase(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();
        db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
    }
}
```

- [ ] **Step 5: Sesión y cuentas**

`server/Viajes.Api/Auth/IdentityMessages.cs`:

```csharp
using Microsoft.AspNetCore.Identity;

namespace Viajes.Api.Auth;

public static class IdentityMessages
{
    public static string Describe(IEnumerable<IdentityError> errors)
    {
        var codes = errors.Select(e => e.Code).ToList();

        if (codes.Any(c => c is "DuplicateUserName" or "DuplicateEmail"))
        {
            return "Ya existe una cuenta con ese email.";
        }

        if (codes.Any(c => c is "InvalidEmail" or "InvalidUserName"))
        {
            return "El email no es válido.";
        }

        if (codes.Any(c => c.StartsWith("Password", StringComparison.Ordinal)))
        {
            return "La contraseña necesita al menos 10 caracteres, con mayúsculas, minúsculas y números.";
        }

        return "No se ha podido crear la cuenta. Inténtalo de nuevo.";
    }
}
```

`server/Viajes.Api/Auth/AuthSetup.cs`:

```csharp
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Identity;
using Viajes.Api.Data;

namespace Viajes.Api.Auth;

public static class AuthSetup
{
    public const string RateLimitPolicy = "auth";

    public static IServiceCollection AddViajesAuth(this IServiceCollection services, IConfiguration config)
    {
        services.AddIdentityCore<IdentityUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 10;
                options.Password.RequireNonAlphanumeric = false;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddEntityFrameworkStores<AppDbContext>()
            .AddSignInManager();

        services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies();

        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "viajes_session";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.ExpireTimeSpan = TimeSpan.FromDays(60);
            options.SlidingExpiration = true;
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        services.AddAuthorization();

        var permitLimit = config.GetValue("AUTH_RATE_LIMIT", 10);
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "desconocida",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = TimeSpan.FromMinutes(1) }));
        });

        return services;
    }
}
```

`server/Viajes.Api/Auth/AuthEndpoints.cs`:

```csharp
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace Viajes.Api.Auth;

public static class AuthEndpoints
{
    public sealed record RegisterRequest(string Email, string Password, string Code);

    public sealed record LoginRequest(string Email, string Password);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").RequireRateLimiting(AuthSetup.RateLimitPolicy);

        group.MapPost("/register", async (
            RegisterRequest body,
            IConfiguration config,
            UserManager<IdentityUser> users,
            SignInManager<IdentityUser> signIn) =>
        {
            // Hasta que existan las invitaciones (Plan 2), solo se registra quien conoce el código.
            if (!IsRegistrationCode(body.Code, config["REGISTRATION_CODE"]))
            {
                return Results.Problem("El código de registro no es válido.", statusCode: StatusCodes.Status403Forbidden);
            }

            var user = new IdentityUser { UserName = body.Email, Email = body.Email };
            var result = await users.CreateAsync(user, body.Password);
            if (!result.Succeeded)
            {
                return Results.Problem(IdentityMessages.Describe(result.Errors), statusCode: StatusCodes.Status400BadRequest);
            }

            await signIn.SignInAsync(user, isPersistent: true);
            return Results.Ok(new { email = user.Email });
        });

        group.MapPost("/login", async (LoginRequest body, SignInManager<IdentityUser> signIn) =>
        {
            var result = await signIn.PasswordSignInAsync(body.Email, body.Password, isPersistent: true, lockoutOnFailure: true);
            if (result.IsLockedOut)
            {
                return Results.Problem("Demasiados intentos. Espera unos minutos.", statusCode: StatusCodes.Status429TooManyRequests);
            }

            return result.Succeeded
                ? Results.Ok(new { email = body.Email })
                : Results.Problem("Email o contraseña incorrectos.", statusCode: StatusCodes.Status401Unauthorized);
        });

        group.MapPost("/logout", async (SignInManager<IdentityUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        });

        app.MapGet("/api/auth/me", (ClaimsPrincipal user) => Results.Ok(new { email = user.Identity!.Name }))
            .RequireAuthorization();
    }

    private static bool IsRegistrationCode(string? given, string? expected) =>
        !string.IsNullOrEmpty(expected)
        && given is not null
        && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected));
}
```

`server/Viajes.Api/Hosting/OriginCheckMiddleware.cs`:

```csharp
namespace Viajes.Api.Hosting;

public sealed class OriginCheckMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var method = context.Request.Method;
        var isWrite = !(HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method));

        if (isWrite && context.Request.Headers.Origin is { Count: > 0 } origin)
        {
            var expected = $"{context.Request.Scheme}://{context.Request.Host}";
            if (!string.Equals(origin.ToString(), expected, StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
        }

        await next(context);
    }
}
```

`server/Viajes.Api/Program.cs`:

```csharp
using Viajes.Api.Auth;
using Viajes.Api.Data;
using Viajes.Api.Hosting;

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
app.Map("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html", SpaHosting.StaticOptions(spa));

app.Run();

public partial class Program;
```

- [ ] **Step 6: Generar la migración inicial**

```powershell
dotnet ef migrations add Initial -p server/Viajes.Api -s server/Viajes.Api -o Data/Migrations
```

Expected: se crean los ficheros en `server/Viajes.Api/Data/Migrations/`.

- [ ] **Step 7: Liberar la base al terminar cada batería**

En `server/Viajes.Tests/TestApp.cs`, añadir `using Microsoft.Data.Sqlite;` y, en `Dispose`, **antes** del `try`:

```csharp
SqliteConnection.ClearAllPools();
```

Sin esto, Windows no deja borrar la carpeta temporal porque la conexión agrupada mantiene el fichero abierto.

- [ ] **Step 8: Ejecutar para ver que pasan**

Run: `dotnet test server`
Expected: PASS, 13 tests.

- [ ] **Step 9: Punto de commit (lo hace Manuel)**

```
Add SQLite, Identity cookie sessions, lockout, rate limiting and origin checks
```

---

### Task 4: API de diagnóstico: operaciones idempotentes y ficheros

**Files:**
- Create: `server/Viajes.Api/Storage/IFileStore.cs`, `server/Viajes.Api/Storage/FileKeys.cs`, `server/Viajes.Api/Storage/LocalFileStore.cs`, `server/Viajes.Api/Storage/S3FileStore.cs`, `server/Viajes.Api/Storage/FileStoreSetup.cs`, `server/Viajes.Api/Diag/DiagEndpoints.cs`
- Modify: `server/Viajes.Api/Program.cs`
- Test: `server/Viajes.Tests/DiagMarksTests.cs`, `server/Viajes.Tests/DiagFileTests.cs`, `server/Viajes.Tests/FileKeysTests.cs`

**Interfaces:**
- Consumes: `AppDbContext`, `DiagMark`, `Auth.RegisterAsync`, `TestApp`.
- Produces: `IFileStore` con `WriteAsync(string key, Stream content, string contentType, CancellationToken)` y `OpenReadAsync(string key, CancellationToken): Task<StoredFile?>`; `FileKeys.IsValid(string): bool`; `FileStoreSetup.AddFileStore(this IServiceCollection, IConfiguration, string dataDir)` (variable `FILE_STORE` = `local` | `s3`); endpoints `POST /api/diag/marks {id,local}` → 204, `GET /api/diag/marks` → `[{id,local}]`, `PUT /api/diag/file` → 204, `GET /api/diag/file`.

- [ ] **Step 1: Escribir los tests que fallan**

`server/Viajes.Tests/DiagMarksTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;

namespace Viajes.Tests;

public sealed class DiagMarksTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Resending_the_same_mark_does_not_duplicate_it()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "reenvio@example.com");
        var mark = new { id = Guid.NewGuid(), local = "26/9/2026 10:00:00" };

        var first = await client.PostAsJsonAsync("/api/diag/marks", mark);
        var second = await client.PostAsJsonAsync("/api/diag/marks", mark);
        var marks = await client.GetFromJsonAsync<List<Mark>>("/api/diag/marks");

        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
        Assert.Single(marks!);
    }

    [Fact]
    public async Task An_id_owned_by_another_user_is_a_conflict()
    {
        var ana = app.CreateHttpsClient();
        await Auth.RegisterAsync(ana, "ana-marcas@example.com");
        var luis = app.CreateHttpsClient();
        await Auth.RegisterAsync(luis, "luis-marcas@example.com");
        var id = Guid.NewGuid();

        await ana.PostAsJsonAsync("/api/diag/marks", new { id, local = "de Ana" });
        var response = await luis.PostAsJsonAsync("/api/diag/marks", new { id, local = "de Luis" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Each_user_only_lists_their_own_marks()
    {
        var ana = app.CreateHttpsClient();
        await Auth.RegisterAsync(ana, "ana-lista@example.com");
        var luis = app.CreateHttpsClient();
        await Auth.RegisterAsync(luis, "luis-lista@example.com");

        await ana.PostAsJsonAsync("/api/diag/marks", new { id = Guid.NewGuid(), local = "de Ana" });
        var marks = await luis.GetFromJsonAsync<List<Mark>>("/api/diag/marks");

        Assert.Empty(marks!);
    }

    [Fact]
    public async Task Marks_require_a_session()
    {
        var response = await app.CreateHttpsClient().PostAsJsonAsync(
            "/api/diag/marks", new { id = Guid.NewGuid(), local = "x" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private sealed record Mark(Guid Id, string Local);
}
```

`server/Viajes.Tests/DiagFileTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Headers;

namespace Viajes.Tests;

public sealed class DiagFileTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task An_uploaded_file_comes_back_identical()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "fichero@example.com");
        var bytes = new byte[1_000_000];
        Random.Shared.NextBytes(bytes);

        var upload = await client.PutAsync("/api/diag/file", Pdf(bytes));
        var download = await client.GetAsync("/api/diag/file");

        Assert.Equal(HttpStatusCode.NoContent, upload.StatusCode);
        Assert.Equal("application/pdf", download.Content.Headers.ContentType?.MediaType);
        Assert.Equal(bytes, await download.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Files_over_20_mb_are_rejected()
    {
        var client = app.CreateHttpsClient();
        await Auth.RegisterAsync(client, "grande@example.com");

        var response = await client.PutAsync("/api/diag/file", Pdf(new byte[20_000_001]));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task Another_user_cannot_read_my_file()
    {
        var ana = app.CreateHttpsClient();
        await Auth.RegisterAsync(ana, "ana-fichero@example.com");
        await ana.PutAsync("/api/diag/file", Pdf([1, 2, 3]));
        var luis = app.CreateHttpsClient();
        await Auth.RegisterAsync(luis, "luis-fichero@example.com");

        var response = await luis.GetAsync("/api/diag/file");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static ByteArrayContent Pdf(byte[] bytes)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        return content;
    }
}
```

`server/Viajes.Tests/FileKeysTests.cs`:

```csharp
using Viajes.Api.Storage;

namespace Viajes.Tests;

public sealed class FileKeysTests
{
    [Theory]
    [InlineData("diag/3f2a-9c/probe", true)]
    [InlineData("../fuera", false)]
    [InlineData("a//b", false)]
    [InlineData("", false)]
    [InlineData("diag/probe.txt", false)]
    public void Only_safe_keys_are_valid(string key, bool expected)
    {
        Assert.Equal(expected, FileKeys.IsValid(key));
    }
}
```

- [ ] **Step 2: Ejecutar para ver que fallan**

Run: `dotnet test server`
Expected: FAIL: no compila, faltan `Viajes.Api.Storage.FileKeys` y los endpoints.

- [ ] **Step 3: Almacenamiento de ficheros**

```powershell
dotnet add server/Viajes.Api package AWSSDK.S3
```

`server/Viajes.Api/Storage/IFileStore.cs`:

```csharp
namespace Viajes.Api.Storage;

public sealed record StoredFile(Stream Content, string ContentType);

public interface IFileStore
{
    Task WriteAsync(string key, Stream content, string contentType, CancellationToken ct);

    Task<StoredFile?> OpenReadAsync(string key, CancellationToken ct);
}
```

`server/Viajes.Api/Storage/FileKeys.cs`:

```csharp
using System.Text.RegularExpressions;

namespace Viajes.Api.Storage;

public static partial class FileKeys
{
    public static bool IsValid(string key) => SafeKey().IsMatch(key);

    [GeneratedRegex("^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$")]
    private static partial Regex SafeKey();
}
```

`server/Viajes.Api/Storage/LocalFileStore.cs`:

```csharp
namespace Viajes.Api.Storage;

public sealed class LocalFileStore(string root) : IFileStore
{
    public async Task WriteAsync(string key, Stream content, string contentType, CancellationToken ct)
    {
        var path = PathFor(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var file = File.Create(path))
        {
            await content.CopyToAsync(file, ct);
        }

        await File.WriteAllTextAsync(path + ".type", contentType, ct);
    }

    public Task<StoredFile?> OpenReadAsync(string key, CancellationToken ct)
    {
        var path = PathFor(key);
        if (!File.Exists(path))
        {
            return Task.FromResult<StoredFile?>(null);
        }

        var contentType = File.Exists(path + ".type") ? File.ReadAllText(path + ".type") : "application/octet-stream";
        return Task.FromResult<StoredFile?>(new StoredFile(File.OpenRead(path), contentType));
    }

    private string PathFor(string key)
    {
        if (!FileKeys.IsValid(key))
        {
            throw new ArgumentException("Clave de fichero no válida.", nameof(key));
        }

        return Path.Combine(root, key.Replace('/', Path.DirectorySeparatorChar));
    }
}
```

`server/Viajes.Api/Storage/S3FileStore.cs`:

```csharp
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
```

`server/Viajes.Api/Storage/FileStoreSetup.cs`:

```csharp
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
```

- [ ] **Step 4: Endpoints de diagnóstico**

`server/Viajes.Api/Diag/DiagEndpoints.cs`:

```csharp
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Data;
using Viajes.Api.Storage;

namespace Viajes.Api.Diag;

public static class DiagEndpoints
{
    public const long MaxFileBytes = 20_000_000;

    public sealed record MarkRequest(Guid Id, string Local);

    public static void MapDiagEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/diag").RequireAuthorization();

        group.MapPost("/marks", async (
            MarkRequest body,
            ClaimsPrincipal principal,
            UserManager<IdentityUser> users,
            AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(body.Local) || body.Local.Length > 100)
            {
                return Results.Problem("La marca debe tener entre 1 y 100 caracteres.", statusCode: StatusCodes.Status400BadRequest);
            }

            var userId = users.GetUserId(principal)!;
            var existing = await db.DiagMarks.FindAsync(body.Id);
            if (existing is not null)
            {
                return existing.UserId == userId
                    ? Results.NoContent()
                    : Results.Problem("Ese identificador ya está en uso.", statusCode: StatusCodes.Status409Conflict);
            }

            db.DiagMarks.Add(new DiagMark
            {
                Id = body.Id,
                UserId = userId,
                Local = body.Local,
                CreatedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            });
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapGet("/marks", async (ClaimsPrincipal principal, UserManager<IdentityUser> users, AppDbContext db) =>
        {
            var userId = users.GetUserId(principal)!;
            var marks = await db.DiagMarks
                .Where(m => m.UserId == userId)
                .OrderBy(m => m.CreatedMs)
                .Select(m => new { m.Id, m.Local })
                .ToListAsync();
            return Results.Ok(marks);
        });

        group.MapPut("/file", async (
            HttpContext http,
            ClaimsPrincipal principal,
            UserManager<IdentityUser> users,
            IFileStore store,
            CancellationToken ct) =>
        {
            var length = http.Request.ContentLength;
            if (length is null)
            {
                return Results.Problem("Falta el tamaño del fichero.", statusCode: StatusCodes.Status411LengthRequired);
            }

            if (length > MaxFileBytes)
            {
                return Results.Problem("El fichero supera los 20 MB.", statusCode: StatusCodes.Status413PayloadTooLarge);
            }

            var contentType = http.Request.ContentType ?? "application/octet-stream";
            await store.WriteAsync(FileKey(users, principal), http.Request.Body, contentType, ct);
            return Results.NoContent();
        });

        group.MapGet("/file", async (
            ClaimsPrincipal principal,
            UserManager<IdentityUser> users,
            IFileStore store,
            CancellationToken ct) =>
        {
            var file = await store.OpenReadAsync(FileKey(users, principal), ct);
            return file is null ? Results.NotFound() : Results.Stream(file.Content, file.ContentType);
        });
    }

    private static string FileKey(UserManager<IdentityUser> users, ClaimsPrincipal principal) =>
        $"diag/{users.GetUserId(principal)}/probe";
}
```

- [ ] **Step 5: Conectarlo en `Program.cs`**

En `server/Viajes.Api/Program.cs`:
- añadir `using Viajes.Api.Diag;` y `using Viajes.Api.Storage;`;
- después de `builder.Services.AddViajesAuth(builder.Configuration);`, añadir `builder.Services.AddFileStore(builder.Configuration, dataDir);`;
- después de `app.MapAuthEndpoints();`, añadir `app.MapDiagEndpoints();`.

- [ ] **Step 6: Ejecutar para ver que pasan**

Run: `dotnet test server`
Expected: PASS, 25 tests.

- [ ] **Step 7: Punto de commit (lo hace Manuel)**

```
Add idempotent diagnostic marks and file storage behind a swappable store
```

---

### Task 5: La PWA de diagnóstico

**Files:**
- Create: `web/public/logo.svg`, `web/pwa-assets.config.ts`
- Create: `web/src/platform/standalone.ts`, `web/src/api.ts`, `web/src/diag/cryptoCheck.ts`, `web/src/diag/probeStore.ts`, `web/src/diag/wakeLock.ts`, `web/src/diag/outbox.ts`
- Create: `web/src/diag/EnvironmentCheck.tsx`, `web/src/diag/AuthCheck.tsx`, `web/src/diag/OutboxCheck.tsx`, `web/src/diag/FilesCheck.tsx`, `web/src/diag/WakeLockCheck.tsx`, `web/src/diag/CryptoCheck.tsx`, `web/src/diag/DiagPage.tsx`
- Modify: `web/vite.config.ts`, `web/index.html`, `web/src/vite-env.d.ts`, `web/src/App.tsx`, `web/src/App.css`
- Delete: `web/src/smoke.test.ts`, `web/src/assets/react.svg`, `web/public/vite.svg`
- Test: `web/src/platform/standalone.test.ts`, `web/src/api.test.ts`, `web/src/diag/cryptoCheck.test.ts`, `web/src/diag/probeStore.test.ts`, `web/src/diag/wakeLock.test.ts`, `web/src/diag/outbox.test.ts`

**Interfaces:**
- Consumes: los endpoints de las Tareas 1, 3 y 4.
- Produces: `isStandalone(env: DisplayEnv): boolean`; `api<T>(path, init?): Promise<T>`, `ApiError`, `describeError(error: unknown): string`; `enqueue(mark)`, `pending()`, `flush(send)`, `toSendResult(error: unknown): SendResult`; `runCryptoCheck(iterations?)`; `saveProbe`, `readProbe`, `daysSince`; `requestWakeLock(nav)`. El Plan 1 reutiliza `api`, `describeError`, `isStandalone` y el patrón de la cola.

- [ ] **Step 1: Dependencias**

```powershell
cd web
npm install idb
npm install -D vite-plugin-pwa @vite-pwa/assets-generator fake-indexeddb
cd ..
```

- [ ] **Step 2: Tests que fallan**

Borrar `web/src/smoke.test.ts`: lo sustituyen estos.

`web/src/platform/standalone.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isStandalone, type DisplayEnv } from './standalone';

function env(displayModeStandalone: boolean, navigatorStandalone?: boolean): DisplayEnv {
  return {
    matchMedia: () => ({ matches: displayModeStandalone }),
    navigator: { standalone: navigatorStandalone },
  };
}

describe('isStandalone', () => {
  it('detecta la app instalada por display-mode', () => {
    expect(isStandalone(env(true))).toBe(true);
  });

  it('detecta la app instalada por navigator.standalone de iOS', () => {
    expect(isStandalone(env(false, true))).toBe(true);
  });

  it('dentro de Safari no está instalada', () => {
    expect(isStandalone(env(false, false))).toBe(false);
    expect(isStandalone(env(false))).toBe(false);
  });
});
```

`web/src/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, describeError } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('devuelve el JSON de una respuesta correcta', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ email: 'ana@example.com' }), { status: 200 }));

    expect(await api<{ email: string }>('/api/auth/me')).toEqual({ email: 'ana@example.com' });
  });

  it('convierte un problema del servidor en ApiError con su mensaje', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ detail: 'Email o contraseña incorrectos.' }), { status: 401 }),
    );

    await expect(api('/api/auth/login', { method: 'POST' })).rejects.toMatchObject({
      status: 401,
      message: 'Email o contraseña incorrectos.',
    });
  });
});

describe('describeError', () => {
  it('un fallo de red se explica como falta de conexión', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('Sin conexión. Inténtalo cuando tengas cobertura.');
  });

  it('cualquier otra cosa da un mensaje genérico', () => {
    expect(describeError(new Error('raro'))).toBe('No se ha podido completar. Inténtalo de nuevo.');
  });
});
```

`web/src/diag/cryptoCheck.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCryptoCheck } from './cryptoCheck';

describe('runCryptoCheck', () => {
  it('deriva la clave, cifra y descifra de ida y vuelta', async () => {
    const result = await runCryptoCheck(1_000);

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.pbkdf2Ms).toBeGreaterThanOrEqual(0);
  });
});
```

`web/src/diag/probeStore.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { daysSince, readProbe, saveProbe } from './probeStore';

beforeEach(() => {
  // Una base vacía por test; el cast evita el choque entre los tipos del DOM y los de fake-indexeddb.
  (globalThis as { indexedDB: unknown }).indexedDB = new IDBFactory();
});

describe('probeStore', () => {
  it('sin nada guardado devuelve null', async () => {
    expect(await readProbe()).toBeNull();
  });

  it('guarda un fichero de varios MB y lo recupera íntegro', async () => {
    await saveProbe(new Uint8Array(5_000_000).fill(7), 'billete.pdf', new Date('2026-09-20T10:00:00Z'));

    expect(await readProbe()).toEqual({
      name: 'billete.pdf',
      size: 5_000_000,
      savedAt: '2026-09-20T10:00:00.000Z',
      intact: true,
    });
  });

  it('cuenta los días transcurridos', () => {
    expect(daysSince('2026-09-20T10:00:00.000Z', new Date('2026-09-26T11:00:00Z'))).toBe(6);
  });
});
```

`web/src/diag/wakeLock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { requestWakeLock } from './wakeLock';

describe('requestWakeLock', () => {
  it('sin API dice que no está soportado', async () => {
    expect(await requestWakeLock({})).toBe('no soportado');
  });

  it('con la API disponible queda activo', async () => {
    expect(await requestWakeLock({ wakeLock: { request: async () => ({}) } })).toBe('activo');
  });

  it('si el sistema lo rechaza lo indica', async () => {
    const nav = { wakeLock: { request: async () => Promise.reject(new Error('NotAllowedError')) } };

    expect(await requestWakeLock(nav)).toBe('rechazado');
  });
});
```

`web/src/diag/outbox.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { enqueue, flush, pending, toSendResult, type Mark } from './outbox';

beforeEach(() => {
  (globalThis as { indexedDB: unknown }).indexedDB = new IDBFactory();
});

const first: Mark = { id: 'a', local: 'primera' };
const second: Mark = { id: 'b', local: 'segunda' };

describe('outbox', () => {
  it('envía los pendientes en orden y vacía la cola', async () => {
    await enqueue(first);
    await enqueue(second);
    const sent: string[] = [];

    const result = await flush(async (mark) => {
      sent.push(mark.id);
      return 'ok';
    });

    expect(sent).toEqual(['a', 'b']);
    expect(result).toEqual({ sent: 2, dropped: 0, left: 0 });
  });

  it('si hay que reintentar, se detiene y conserva el orden', async () => {
    await enqueue(first);
    await enqueue(second);

    const result = await flush(async () => 'retry');

    expect(result).toEqual({ sent: 0, dropped: 0, left: 2 });
    expect((await pending()).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('una operación rechazada se descarta y la cola sigue', async () => {
    await enqueue(first);
    await enqueue(second);

    const result = await flush(async (mark) => (mark.id === 'a' ? 'drop' : 'ok'));

    expect(result).toEqual({ sent: 1, dropped: 1, left: 0 });
  });

  it('clasifica los errores: la sesión caducada y la red se reintentan, el rechazo se descarta', () => {
    expect(toSendResult(new ApiError(401, 'x'))).toBe('retry');
    expect(toSendResult(new TypeError('Failed to fetch'))).toBe('retry');
    expect(toSendResult(new ApiError(500, 'x'))).toBe('retry');
    expect(toSendResult(new ApiError(403, 'x'))).toBe('drop');
    expect(toSendResult(new ApiError(409, 'x'))).toBe('drop');
  });
});
```

- [ ] **Step 3: Ejecutar para ver que fallan**

Run: `npm test --prefix web`
Expected: FAIL en los seis ficheros (no existen los módulos).

- [ ] **Step 4: Implementar los módulos**

`web/src/platform/standalone.ts`:

```ts
export interface DisplayEnv {
  matchMedia(query: string): { matches: boolean };
  navigator: { standalone?: boolean };
}

// iOS solo expone navigator.standalone; el resto de navegadores, display-mode.
export function isStandalone(env: DisplayEnv): boolean {
  return env.matchMedia('(display-mode: standalone)').matches || env.navigator.standalone === true;
}
```

`web/src/api.ts`:

```ts
const GENERIC = 'No se ha podido completar. Inténtalo de nuevo.';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  if (!response.ok) {
    let message = GENERIC;
    try {
      const problem = (await response.json()) as { detail?: string; title?: string };
      message = problem.detail ?? problem.title ?? GENERIC;
    } catch {
      // Respuesta sin cuerpo JSON: queda el mensaje genérico.
    }
    throw new ApiError(response.status, message);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof TypeError) {
    return 'Sin conexión. Inténtalo cuando tengas cobertura.';
  }
  return GENERIC;
}
```

`web/src/diag/cryptoCheck.ts`:

```ts
export interface CryptoCheckResult {
  ok: boolean;
  pbkdf2Ms: number;
  error?: string;
}

const SAMPLE = 'contenido de prueba';

export async function runCryptoCheck(iterations = 600_000): Promise<CryptoCheckResult> {
  const encoder = new TextEncoder();
  const start = performance.now();
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey(
      'raw',
      encoder.encode('seis palabras de prueba para derivar'),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const pbkdf2Ms = performance.now() - start;

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(SAMPLE));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);

    return { ok: new TextDecoder().decode(plain) === SAMPLE, pbkdf2Ms };
  } catch (e) {
    return { ok: false, pbkdf2Ms: performance.now() - start, error: String(e) };
  }
}
```

`web/src/diag/probeStore.ts`:

```ts
import { openDB } from 'idb';

const DB_NAME = 'viajes-diag';
const STORE = 'probe';
const KEY = 'probe';

export interface Probe {
  name: string;
  size: number;
  savedAt: string;
  intact: boolean;
}

interface StoredProbe {
  name: string;
  size: number;
  savedAt: string;
  bytes: Uint8Array;
}

function open() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  });
}

export async function saveProbe(bytes: Uint8Array, name: string, now: Date): Promise<void> {
  const database = await open();
  const record: StoredProbe = { name, size: bytes.byteLength, savedAt: now.toISOString(), bytes };
  await database.put(STORE, record, KEY);
  database.close();
}

export async function readProbe(): Promise<Probe | null> {
  const database = await open();
  const record = (await database.get(STORE, KEY)) as StoredProbe | undefined;
  database.close();
  if (!record) {
    return null;
  }
  return {
    name: record.name,
    size: record.size,
    savedAt: record.savedAt,
    intact: record.bytes?.byteLength === record.size,
  };
}

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}
```

`web/src/diag/wakeLock.ts`:

```ts
export type WakeLockStatus = 'activo' | 'no soportado' | 'rechazado';

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<unknown> };
}

// Se conserva la referencia para que el bloqueo no se libere mientras la página está visible.
export let wakeLockSentinel: unknown;

export async function requestWakeLock(nav: WakeLockNavigator): Promise<WakeLockStatus> {
  if (!nav.wakeLock) {
    return 'no soportado';
  }
  try {
    wakeLockSentinel = await nav.wakeLock.request('screen');
    return 'activo';
  } catch {
    return 'rechazado';
  }
}
```

`web/src/diag/outbox.ts`:

```ts
import { openDB } from 'idb';
import { ApiError } from '../api';

export interface Mark {
  id: string;
  local: string;
}

export type SendResult = 'ok' | 'retry' | 'drop';

const DB_NAME = 'viajes-outbox';
const STORE = 'queue';

function open() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { autoIncrement: true });
    },
  });
}

export async function enqueue(mark: Mark): Promise<void> {
  const database = await open();
  await database.add(STORE, mark);
  database.close();
}

export async function pending(): Promise<Mark[]> {
  const database = await open();
  const marks = (await database.getAll(STORE)) as Mark[];
  database.close();
  return marks;
}

export async function flush(send: (mark: Mark) => Promise<SendResult>): Promise<{ sent: number; dropped: number; left: number }> {
  const database = await open();
  let sent = 0;
  let dropped = 0;
  try {
    for (;;) {
      const cursor = await database.transaction(STORE).store.openCursor();
      if (!cursor) {
        break;
      }
      const key = cursor.key;
      const result = await send(cursor.value as Mark);
      if (result === 'retry') {
        break;
      }
      await database.delete(STORE, key);
      if (result === 'ok') {
        sent++;
      } else {
        dropped++;
      }
    }
    return { sent, dropped, left: await database.count(STORE) };
  } finally {
    database.close();
  }
}

// 401 = sesión caducada: la operación espera a que se vuelva a entrar, no se pierde.
export function toSendResult(error: unknown): SendResult {
  if (error instanceof ApiError && error.status !== 401 && error.status >= 400 && error.status < 500) {
    return 'drop';
  }
  return 'retry';
}
```

- [ ] **Step 5: Ejecutar para ver que pasan**

Run: `npm test --prefix web`
Expected: PASS, 18 tests.

- [ ] **Step 6: PWA, iconos y destino del build**

`web/public/logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1f3a5f"/>
  <rect x="136" y="176" width="240" height="200" rx="28" fill="#ffffff"/>
  <rect x="206" y="120" width="100" height="70" rx="18" fill="none" stroke="#ffffff" stroke-width="24"/>
  <rect x="136" y="256" width="240" height="20" fill="#1f3a5f"/>
</svg>
```

`web/pwa-assets.config.ts`:

```ts
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset,
  images: ['public/logo.svg'],
});
```

`web/vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: { config: true },
      manifest: {
        name: 'Viajes',
        short_name: 'Viajes',
        lang: 'es',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#1f3a5f',
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: '../server/Viajes.Api/wwwroot',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://localhost:5080' },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

Al final de `web/src/vite-env.d.ts`:

```ts
declare const __APP_VERSION__: string;
```

En `web/index.html`, dentro de `<head>`, sustituir el `<title>` y el enlace al favicon de Vite por:

```html
<title>Viajes</title>
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Viajes" />
<meta name="theme-color" content="#1f3a5f" />
```

Borrar `web/src/assets/react.svg` y `web/public/vite.svg`.

- [ ] **Step 7: Componentes de la página**

`web/src/diag/EnvironmentCheck.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { isStandalone, type DisplayEnv } from '../platform/standalone';

export function EnvironmentCheck() {
  const [persisted, setPersisted] = useState('comprobando…');

  useEffect(() => {
    if (!navigator.storage?.persist) {
      setPersisted('no soportado');
      return;
    }
    navigator.storage.persist().then(
      (granted) => setPersisted(granted ? '✅ concedido' : '⚠️ denegado'),
      () => setPersisted('error'),
    );
  }, []);

  const standalone = isStandalone(window as unknown as DisplayEnv);

  return (
    <section>
      <h2>Entorno</h2>
      <p>Versión: {__APP_VERSION__}</p>
      <p>Modo: {standalone ? '✅ instalada en la pantalla de inicio' : '⚠️ dentro de Safari, sin instalar'}</p>
      <p>Almacenamiento persistente: {persisted}</p>
      <p>Red: {navigator.onLine ? 'con conexión' : 'sin conexión'}</p>
    </section>
  );
}
```

`web/src/diag/AuthCheck.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { api, describeError } from '../api';

type Session = { state: 'unknown' } | { state: 'offline' } | { state: 'out' } | { state: 'in'; email: string };

export function AuthCheck({ onSignedIn }: { onSignedIn: (signedIn: boolean) => void }) {
  const [session, setSession] = useState<Session>({ state: 'unknown' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<{ email: string }>('/api/auth/me').then(
      (me) => {
        setSession({ state: 'in', email: me.email });
        onSignedIn(true);
      },
      (error) => {
        setSession(error instanceof TypeError ? { state: 'offline' } : { state: 'out' });
        onSignedIn(false);
      },
    );
  }, [onSignedIn]);

  async function submit(path: string, body: object) {
    setMessage('');
    try {
      const me = await api<{ email: string }>(path, { method: 'POST', body: JSON.stringify(body) });
      setSession({ state: 'in', email: me.email });
      onSignedIn(true);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function signIn(event: FormEvent) {
    event.preventDefault();
    void submit('/api/auth/login', { email, password });
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession({ state: 'out' });
    onSignedIn(false);
  }

  return (
    <section>
      <h2>1 · Sesión</h2>
      {session.state === 'in' && (
        <>
          <p>✅ Sesión iniciada: {session.email}</p>
          <button onClick={() => void signOut()}>Cerrar sesión</button>
        </>
      )}
      {session.state === 'offline' && <p>Sin conexión: la sesión se comprobará al volver la red.</p>}
      {session.state === 'out' && (
        <form onSubmit={signIn}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit">Entrar</button>
          <input placeholder="Código de registro (solo para crear cuenta)" value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="button" onClick={() => void submit('/api/auth/register', { email, password, code })}>
            Crear cuenta
          </button>
        </form>
      )}
      {message && <p className="error">{message}</p>}
    </section>
  );
}
```

`web/src/diag/OutboxCheck.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { enqueue, flush, pending, toSendResult, type Mark, type SendResult } from './outbox';

async function sendMark(mark: Mark): Promise<SendResult> {
  try {
    await api('/api/diag/marks', { method: 'POST', body: JSON.stringify(mark) });
    return 'ok';
  } catch (error) {
    return toSendResult(error);
  }
}

export function OutboxCheck({ signedIn }: { signedIn: boolean }) {
  const [queued, setQueued] = useState(0);
  const [server, setServer] = useState('—');
  const [last, setLast] = useState('');

  const refresh = useCallback(async () => {
    setQueued((await pending()).length);
    if (!signedIn) {
      return;
    }
    try {
      const marks = await api<Mark[]>('/api/diag/marks');
      setServer(`${marks.length} marcas${marks.length ? ` · última: ${marks[marks.length - 1].local}` : ''}`);
    } catch (error) {
      setServer(describeError(error));
    }
  }, [signedIn]);

  const send = useCallback(async () => {
    const result = await flush(sendMark);
    setLast(`Enviadas ${result.sent} · descartadas ${result.dropped} · quedan ${result.left}`);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void send();
    const onOnline = () => void send();
    const onVisible = () => document.visibilityState === 'visible' && void send();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [send]);

  async function add() {
    await enqueue({ id: crypto.randomUUID(), local: new Date().toLocaleString('es-ES') });
    await send();
  }

  return (
    <section>
      <h2>2 · Cambios sin conexión</h2>
      <p>En cola en el móvil: {queued}</p>
      <p>En el servidor: {server}</p>
      {last && <p>{last}</p>}
      <button onClick={() => void add()}>Añadir marca</button>
    </section>
  );
}
```

`web/src/diag/FilesCheck.tsx`:

```tsx
import { useEffect, useState, type ChangeEvent } from 'react';
import { describeError } from '../api';
import { daysSince, readProbe, saveProbe, type Probe } from './probeStore';

const MB = 1_000_000;

export function FilesCheck({ signedIn }: { signedIn: boolean }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [remote, setRemote] = useState('');

  useEffect(() => {
    void readProbe().then(setProbe);
  }, []);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) {
      return;
    }
    setFile(picked);
    await saveProbe(new Uint8Array(await picked.arrayBuffer()), picked.name, new Date());
    setProbe(await readProbe());
  }

  async function upload() {
    if (!file) {
      return;
    }
    try {
      const response = await fetch('/api/diag/file', {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      setRemote(response.ok ? '✅ subido' : `🔴 error ${response.status}`);
    } catch (error) {
      setRemote(describeError(error));
    }
  }

  async function download() {
    try {
      const response = await fetch('/api/diag/file');
      if (!response.ok) {
        setRemote(`🔴 error ${response.status}`);
        return;
      }
      const blob = await response.blob();
      const same = file ? blob.size === file.size : false;
      setRemote(`✅ descargado ${(blob.size / MB).toFixed(1)} MB${file ? (same ? ' · mismo tamaño' : ' · 🔴 tamaño distinto') : ''}`);
    } catch (error) {
      setRemote(describeError(error));
    }
  }

  return (
    <section>
      <h2>3 y 4 · Adjuntar, guardar en el móvil y subir</h2>
      <input type="file" accept="image/*,application/pdf" onChange={(e) => void onPick(e)} />
      {file && <p>Elegido: {file.name} · {file.type || 'sin tipo'} · {(file.size / MB).toFixed(1)} MB</p>}
      {probe ? (
        <p>
          En el móvil: {probe.name} ({(probe.size / MB).toFixed(1)} MB), guardado hace {daysSince(probe.savedAt, new Date())} días ·{' '}
          {probe.intact ? '✅ íntegro' : '🔴 dañado'}
        </p>
      ) : (
        <p>Nada guardado en el móvil todavía.</p>
      )}
      {signedIn && (
        <>
          <button disabled={!file} onClick={() => void upload()}>Subir al servidor</button>
          <button onClick={() => void download()}>Descargar del servidor</button>
        </>
      )}
      {remote && <p>{remote}</p>}
    </section>
  );
}
```

`web/src/diag/WakeLockCheck.tsx`:

```tsx
import { useState } from 'react';
import { requestWakeLock, type WakeLockStatus } from './wakeLock';

export function WakeLockCheck() {
  const [status, setStatus] = useState<WakeLockStatus | 'sin probar'>('sin probar');

  return (
    <section>
      <h2>5 · Pantalla encendida</h2>
      <p>Estado: {status}</p>
      <button onClick={() => void requestWakeLock(navigator as never).then(setStatus)}>Mantener encendida</button>
    </section>
  );
}
```

`web/src/diag/CryptoCheck.tsx`:

```tsx
import { useState } from 'react';
import { runCryptoCheck, type CryptoCheckResult } from './cryptoCheck';

export function CryptoCheck() {
  const [result, setResult] = useState<CryptoCheckResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResult(await runCryptoCheck());
    setRunning(false);
  }

  return (
    <section>
      <h2>6 · Cifrado</h2>
      <button disabled={running} onClick={() => void run()}>
        {running ? 'Calculando…' : 'Probar 600.000 iteraciones'}
      </button>
      {result && (
        <p>
          {result.ok ? '✅' : '🔴'} {Math.round(result.pbkdf2Ms)} ms{' '}
          {result.pbkdf2Ms < 2000 ? '(dentro del límite de 2 s)' : '(⚠️ supera 2 s)'}
          {result.error && ` · ${result.error}`}
        </p>
      )}
    </section>
  );
}
```

`web/src/diag/DiagPage.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { AuthCheck } from './AuthCheck';
import { CryptoCheck } from './CryptoCheck';
import { EnvironmentCheck } from './EnvironmentCheck';
import { FilesCheck } from './FilesCheck';
import { OutboxCheck } from './OutboxCheck';
import { WakeLockCheck } from './WakeLockCheck';

export function DiagPage() {
  const [signedIn, setSignedIn] = useState(false);
  const onSignedIn = useCallback((value: boolean) => setSignedIn(value), []);

  return (
    <main>
      <h1>Viajes · diagnóstico</h1>
      <EnvironmentCheck />
      <AuthCheck onSignedIn={onSignedIn} />
      <OutboxCheck signedIn={signedIn} />
      <FilesCheck signedIn={signedIn} />
      <WakeLockCheck />
      <CryptoCheck />
    </main>
  );
}
```

`web/src/App.tsx`:

```tsx
import { DiagPage } from './diag/DiagPage';
import './App.css';

export default function App() {
  return <DiagPage />;
}
```

`web/src/App.css` (sustituir el contenido):

```css
main { max-width: 36rem; margin: 0 auto; padding: 1rem 1rem 3rem; font-family: -apple-system, system-ui, sans-serif; }
section { border: 1px solid #ddd; border-radius: 12px; padding: 0.75rem 1rem; margin: 0.75rem 0; }
h1 { font-size: 1.3rem; }
h2 { font-size: 1rem; margin: 0 0 0.5rem; }
input, button { font-size: 1rem; margin: 0.25rem 0; display: block; width: 100%; padding: 0.5rem; box-sizing: border-box; }
.error { color: #b42318; }
```

- [ ] **Step 8: Comprobar el build y en local**

Run: `npm test --prefix web` → Expected: PASS, 18 tests.
Run: `npm run build --prefix web` → Expected: sin errores; en `server/Viajes.Api/wwwroot/` hay `index.html`, `sw.js`, `manifest.webmanifest` y los iconos. Abrir `manifest.webmanifest` y confirmar que el array `icons` **no está vacío**.

En dos terminales:

```powershell
$env:REGISTRATION_CODE = "prueba-local"; dotnet run --project server/Viajes.Api --urls http://localhost:5080
```

```powershell
npm run dev --prefix web
```

Abrir http://localhost:5173: crear una cuenta con el código `prueba-local`, añadir una marca, elegir un PDF, subirlo y descargarlo, y probar el cifrado. Nada debe dar error en la consola del navegador.

- [ ] **Step 9: Punto de commit (lo hace Manuel)**

```
Add the diagnostic PWA with an offline outbox and file checks
```

---

### Task 6: Imagen Docker y despliegue en Railway

**Files:**
- Create: `Dockerfile`, `.dockerignore`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la URL pública `https://<servicio>.up.railway.app`.

- [ ] **Step 1: `.dockerignore`**

```
**/node_modules
**/bin
**/obj
server/Viajes.Api/wwwroot
**/.localdata
.git
docs
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
COPY server/ ./server/
COPY --from=web /src/server/Viajes.Api/wwwroot ./server/Viajes.Api/wwwroot
RUN dotnet publish server/Viajes.Api/Viajes.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server /app ./
USER root
RUN mkdir -p /data && chown $APP_UID /data
USER $APP_UID
ENV DATA_DIR=/data
# Railway termina el TLS en su proxy: sin esto la app se cree en http y rechaza como ajeno el Origin https.
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
ENTRYPOINT ["dotnet", "Viajes.Api.dll"]
```

- [ ] **Step 3: Probar la imagen en local**

```powershell
docker build -t viajes .
docker run --rm -p 8080:8080 -e PORT=8080 -e REGISTRATION_CODE=prueba-local -v viajes-data:/data viajes
```

En otra terminal:

Run: `Invoke-RestMethod http://localhost:8080/api/health`
Expected: `status: ok`.

Abrir http://localhost:8080: debe cargar la página de diagnóstico y dejar crear una cuenta. Parar el contenedor con Ctrl+C.

- [ ] **Step 4: Crear el servicio en Railway (lo hace Manuel)**

1. En https://railway.com, **New Project** → **Empty Project**, y dentro, **Create → Empty Service** llamado `viajes`.
2. En el servicio → **Settings → Volumes**: añadir un volumen montado en **`/data`**.
3. En **Variables**:
   - `REGISTRATION_CODE` = una cadena aleatoria larga (se la guarda Manuel; es la que abre el registro).
   - `RAILWAY_RUN_UID` = `0`. El volumen de Railway pertenece a root y la imagen corre sin privilegios: sin esto, el servicio no puede crear la base y no arranca.
4. **Almacenamiento de ficheros**: en el proyecto, **Create** y buscar **Bucket**.
   - Si existe, crearlo y añadir las variables `FILE_STORE` = `s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` y `S3_REGION` con los valores que muestre.
   - Si no existe, `FILE_STORE` = `local`, y **anotarlo** en los resultados: la especificación prevé esta alternativa.
5. **Settings → Networking → Generate Domain**. Anotar la URL.
6. En los ajustes del workspace, poner un **aviso de consumo** para ver lo que suma este servicio a la factura.

- [ ] **Step 5: Desplegar**

```powershell
npx @railway/cli login
npx @railway/cli link
npx @railway/cli up
```

En `link`, elegir el proyecto y el servicio `viajes`.

Expected: el despliegue termina en verde. En **Deploy Logs** no hay errores de permisos sobre `/data`, y `https://<servicio>.up.railway.app/api/health` responde `{"status":"ok"}`.

- [ ] **Step 6: Punto de commit (lo hace Manuel)**

```
Add the Docker image and Railway deployment
```

---

### Task 7: La prueba en el iPhone

**Files:**
- Create: `docs/superpowers/spike/2026-09-26-resultados-viabilidad.md`

**Interfaces:**
- Consumes: la URL de la Tarea 6.
- Produces: el documento de resultados que decide si se escribe el Plan 1.

- [ ] **Step 1: Documento de resultados**

`docs/superpowers/spike/2026-09-26-resultados-viabilidad.md`:

```markdown
# Resultados de la prueba de viabilidad en iPhone

- iPhone: 
- Versión de iOS: 
- URL: 
- Fecha de instalación: 
- Almacenamiento de ficheros: bucket S3 de Railway / volumen local

| # | Comprobación | Criterio de éxito | Resultado | Observaciones |
|---|---|---|---|---|
| 0a | Modo instalado | «✅ instalada en la pantalla de inicio» | | |
| 0b | Almacenamiento persistente | «✅ concedido» (si sale «denegado», anotar: no bloquea) | | |
| 1 | Sesión | Se inicia sesión dentro de la app y **sigue iniciada** al cerrarla del todo y reabrirla | | |
| 1b | Sesión a +1 día | Sigue iniciada al día siguiente | | |
| 1c | Sesión a +8 días | Sigue iniciada a los 8 días (condición del Plan 3) | | |
| 2 | Cambios sin conexión | En modo avión, «Añadir marca» deja la marca **en cola**; al volver la red se envía sola y aparece en el servidor **una sola vez** | | |
| 3 | Fichero en el móvil | Sigue «✅ íntegro» al día siguiente | | |
| 3b | Fichero a +8 días | Sigue «✅ íntegro» a los 8 días (condición del Plan 3) | | |
| 4 | Adjuntar y subir | El selector ofrece **cámara, Fotos y Archivos**; un PDF de varios MB se sube y se descarga con el mismo tamaño | | |
| 5 | Pantalla encendida | «activo», y la pantalla no se apaga en 2 minutos sin tocarla | | |
| 6 | Cifrado | ✅ y **menos de 2.000 ms** | | |
| R1 | Abre sin red | En modo avión, abrir desde el icono carga la app, no un error de Safari | | |
| R3 | Sesión de Safari no compartida | Con sesión iniciada en Safari, la app instalada pide iniciar sesión sin quedarse colgada | | |
| R4 | Despliegue nuevo | Tras redesplegar: al reabrir la app aparece la **versión nueva** y la sesión **sigue iniciada** | | |

## Conclusión

- [ ] Todas superadas (salvo las de +8 días, que se anotan cuando toque) → se escribe el Plan 1.
- [ ] Alguna falla → se revisa la especificación antes de seguir.
```

- [ ] **Step 2: Instalar en el iPhone (lo hace Manuel)**

1. Abrir la URL en **Safari**, crear la cuenta con el `REGISTRATION_CODE` e iniciar sesión.
2. **Compartir** → **Añadir a pantalla de inicio** → Añadir.
3. Abrir la app **desde el icono**. Comprobar **R3** (debe pedir iniciar sesión, porque la de Safari no se comparte), iniciar sesión, y comprobar **0a** y **0b**.

- [ ] **Step 3: Comprobaciones del primer día**

En este orden: **1** → **4** (con un PDF de varios MB elegido desde Archivos) → **5** → **6** → **2** → **R1**. Las de modo avión (2 y R1) al final. Anotar cada resultado en la tabla.

- [ ] **Step 4: Despliegue nuevo (R4)**

Run: `npx @railway/cli up`
Después, en el iPhone, cerrar la app del todo y reabrirla dos veces. La «Versión» de Entorno debe cambiar y la sesión seguir iniciada. Anotar R4.

- [ ] **Step 5: A +1 día**

Abrir la app desde el icono **sin haberla abierto entretanto** y anotar **1b** y **3**.

- [ ] **Step 6: Decidir**

Si todo salvo 1c y 3b está superado, marcar «Todas superadas» y se escribe el Plan 1. **1c** y **3b** se anotan a los 8 días y condicionan el Plan 3.

- [ ] **Step 7: Punto de commit (lo hace Manuel)**

```
Record the iPhone feasibility results
```
