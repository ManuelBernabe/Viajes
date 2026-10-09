using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;
using Viajes.Api.Storage;
using Viajes.Api.Weather;

namespace Viajes.Api.Trips;

/// <summary>
/// «📔 Diario del viaje»: una nota y fotos por día, que escribe cualquiera del hogar, y un resumen con lo recorrido
/// (vuelos, kilómetros, noches, ciudades y países). Se guarda en AppSettings («journal:{viaje}:{día}» y
/// «jphoto:{viaje}:{foto}») y las fotos en el almacén de ficheros; si el viaje tiene enlace para compartir, sale también ahí.
/// </summary>
public static partial class Journal
{
    public const long MaxPhotoBytes = 8_000_000;
    public const int MaxPhotosPerDay = 12;

    public sealed record DayRecord(string? Text, long UpdatedMs, string? UpdatedBy);

    public sealed record PhotoRecord(string Date, string Mime, long Size, string? By, long Ms, bool Thumb = false);

    public sealed record PhotoDto(Guid Id, string Mime);

    public sealed record DayDto(string Date, string? Text, long? UpdatedMs, string? UpdatedBy, List<PhotoDto> Photos);

    public sealed record CountryDto(string Country, string? Flag);

    public sealed record Stats(int Flights, int Trains, int Km, int Nights, List<string> Cities, List<CountryDto> Countries);

    public sealed record JournalDto(List<DayDto> Days, Stats Stats);

    public sealed record TextBody(string? Text);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private static readonly HashSet<string> PhotoTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];

    public static string DayKey(Guid tripId, string date) => $"journal:{tripId:N}:{date}";

    public static string PhotoKey(Guid tripId, Guid photoId) => $"jphoto:{tripId:N}:{photoId:N}";

    public static string FileKey(Guid tripId, Guid photoId, bool thumb = false) => $"trips/{tripId}/journal/{photoId}{(thumb ? "-mini" : "")}";

    public const long MaxThumbBytes = 300_000;

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
    private static partial Regex DatePattern();

    public static void MapJournal(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/trips/{id:guid}/journal").RequireAuthorization();
        group.MapGet("", Get);
        group.MapPut("/{date}", PutText);
        group.MapPost("/{date}/photos", AddPhoto).DisableAntiforgery();
        group.MapGet("/photos/{photoId:guid}", GetPhoto);
        group.MapPut("/photos/{photoId:guid}/thumb", PutThumb).DisableAntiforgery();
        group.MapDelete("/photos/{photoId:guid}", DeletePhoto);
    }

    private static async Task<Trip?> TripFor(Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access)
    {
        var trip = await access.VisibleTrip(users.GetUserId(principal)!, id);
        return trip is null || trip.DeletedAtMs is not null ? null : trip;
    }

    private static async Task<IResult> Get(
        Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, CancellationToken ct)
    {
        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var bookings = await access.VisibleBookings(users.GetUserId(principal)!).Where(b => b.TripId == id && b.DeletedAtMs == null).ToListAsync(ct);
        return Results.Ok(await Load(db, id, bookings, ct));
    }

    /// <summary>El diario y el resumen de un viaje, con las reservas que se le pasen (las que ve quien pregunta).</summary>
    public static async Task<JournalDto> Load(AppDbContext db, Guid tripId, IReadOnlyList<Booking> bookings, CancellationToken ct)
    {
        var dayPrefix = $"journal:{tripId:N}:";
        var photoPrefix = $"jphoto:{tripId:N}:";
        var rows = await db.AppSettings.AsNoTracking()
            .Where(a => a.Key.StartsWith(dayPrefix) || a.Key.StartsWith(photoPrefix))
            .ToListAsync(ct);
        var days = rows.Where(r => r.Key.StartsWith(dayPrefix))
            .ToDictionary(r => r.Key[dayPrefix.Length..], r => JsonSerializer.Deserialize<DayRecord>(r.Value, Json)!);
        var photos = rows.Where(r => r.Key.StartsWith(photoPrefix))
            .Select(r => (Id: Guid.ParseExact(r.Key[photoPrefix.Length..], "N"), Photo: JsonSerializer.Deserialize<PhotoRecord>(r.Value, Json)!))
            .ToList();
        var dates = days.Keys.Concat(photos.Select(p => p.Photo.Date)).Distinct().Order(StringComparer.Ordinal);
        var list = dates
            .Select(date =>
            {
                days.TryGetValue(date, out var day);
                var dayPhotos = photos.Where(p => p.Photo.Date == date).OrderBy(p => p.Photo.Ms).Select(p => new PhotoDto(p.Id, p.Photo.Mime)).ToList();
                return new DayDto(date, day?.Text, day?.UpdatedMs, day?.UpdatedBy, dayPhotos);
            })
            .Where(d => d.Text is not null || d.Photos.Count > 0)
            .ToList();

        var countries = new List<CountryDto>();
        var cached = await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(a => a.Key == DestinationInfo.Key(tripId, "es"), ct);
        if (cached is not null && JsonSerializer.Deserialize<DestinationInfo.InfoDto>(cached.Value, Json) is { } info)
        {
            countries = info.Countries.Select(c => new CountryDto(c.Country, c.Flag)).ToList();
        }

        return new JournalDto(list, StatsFor(bookings, countries));
    }

    /// <summary>Cifras del viaje: un vuelo de varios pasajeros cuenta una vez; los kilómetros, en línea recta entre aeropuertos.</summary>
    public static Stats StatsFor(IEnumerable<Booking> bookings, List<CountryDto> countries)
    {
        var alive = bookings.Where(b => b.DeletedAtMs is null).ToList();
        var flights = alive.Where(b => b.Type == "flight")
            .GroupBy(b => (b.StartUtcMs, From: b.StartPlace?.Trim().ToUpperInvariant(), To: b.EndPlace?.Trim().ToUpperInvariant()))
            .Select(g => g.Key)
            .ToList();
        var km = 0.0;
        var cities = new List<string>();
        foreach (var flight in flights.OrderBy(f => f.StartUtcMs))
        {
            var from = Airports.Find(flight.From);
            var to = Airports.Find(flight.To);
            if (from is not null && to is not null)
            {
                km += Distance(from, to);
            }

            if (to is not null && !cities.Contains(to.Label))
            {
                cities.Add(to.Label);
            }
        }

        var trains = alive.Where(b => b.Type == "train").Select(b => (b.StartUtcMs, b.StartPlace, b.EndPlace)).Distinct().Count();
        var nights = new HashSet<string>();
        foreach (var hotel in alive.Where(b => b.Type == "hotel" && b.EndLocal is { Length: >= 10 }))
        {
            if (!DateOnly.TryParseExact(hotel.StartLocal[..10], "yyyy-MM-dd", out var day) || !DateOnly.TryParseExact(hotel.EndLocal![..10], "yyyy-MM-dd", out var end))
            {
                continue;
            }

            for (; day < end && nights.Count < 400; day = day.AddDays(1))
            {
                nights.Add(day.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture));
            }
        }

        return new Stats(flights.Count, trains, (int)Math.Round(km), nights.Count, cities, countries);
    }

    private static double Distance(GeoPoint a, GeoPoint b)
    {
        const double R = 6371;
        double Rad(double d) => d * Math.PI / 180;
        var dLat = Rad(b.Lat - a.Lat);
        var dLon = Rad(b.Lon - a.Lon);
        var h = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) + Math.Cos(Rad(a.Lat)) * Math.Cos(Rad(b.Lat)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * R * Math.Asin(Math.Min(1, Math.Sqrt(h)));
    }

    private static async Task<IResult> PutText(
        Guid id, string date, TextBody body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, CancellationToken ct)
    {
        if (!DatePattern().IsMatch(date))
        {
            return Results.Problem("Las fechas van como «2026-10-12».", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var userId = users.GetUserId(principal)!;
        var text = body.Text?.Trim();
        var key = DayKey(id, date);
        var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == key, ct);
        if (string.IsNullOrEmpty(text))
        {
            if (row is not null)
            {
                db.AppSettings.Remove(row);
                await db.SaveChangesAsync(ct);
            }

            return Results.NoContent();
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = (await users.FindByIdAsync(userId))?.Email;
        row ??= db.AppSettings.Add(new AppSetting { Key = key, Value = "" }).Entity;
        row.Value = JsonSerializer.Serialize(new DayRecord(text[..Math.Min(text.Length, 4000)], now, email), Json);
        row.UpdatedMs = now;
        row.UpdatedBy = userId;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> AddPhoto(
        Guid id, string date, HttpContext http, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db,
        IFileStore store, CancellationToken ct)
    {
        if (!DatePattern().IsMatch(date))
        {
            return Results.Problem("Las fechas van como «2026-10-12».", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var mime = (http.Request.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
        if (!PhotoTypes.Contains(mime))
        {
            return Results.Problem("Solo fotos (JPEG, PNG, WebP o HEIC).", statusCode: StatusCodes.Status415UnsupportedMediaType);
        }

        if (http.Request.ContentLength is not { } length || length > MaxPhotoBytes)
        {
            return Results.Problem("La foto supera los 8 MB.", statusCode: StatusCodes.Status413PayloadTooLarge);
        }

        var prefix = $"jphoto:{id:N}:";
        var existing = await db.AppSettings.Where(a => a.Key.StartsWith(prefix)).Select(a => a.Value).ToListAsync(ct);
        if (existing.Count(v => JsonSerializer.Deserialize<PhotoRecord>(v, Json)?.Date == date) >= MaxPhotosPerDay)
        {
            return Results.Problem($"Como mucho {MaxPhotosPerDay} fotos por día.", statusCode: StatusCodes.Status409Conflict);
        }

        var userId = users.GetUserId(principal)!;
        var photoId = Guid.NewGuid();
        await store.WriteAsync(FileKey(id, photoId), http.Request.Body, mime, ct);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        db.AppSettings.Add(new AppSetting
        {
            Key = PhotoKey(id, photoId),
            Value = JsonSerializer.Serialize(new PhotoRecord(date, mime, length, (await users.FindByIdAsync(userId))?.Email, now), Json),
            UpdatedMs = now,
            UpdatedBy = userId,
        });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new PhotoDto(photoId, mime));
    }

    private static async Task<IResult> GetPhoto(
        Guid id, Guid photoId, string? size, HttpContext http, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db,
        IFileStore store, CancellationToken ct)
    {
        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        return await Serve(http, db, store, id, photoId, size == "thumb", ct);
    }

    /// <summary>La miniatura (unos 30 KB) que hace el móvil al subir la foto: es lo que se ve en la cuadrícula.</summary>
    private static async Task<IResult> PutThumb(
        Guid id, Guid photoId, HttpContext http, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db,
        IFileStore store, CancellationToken ct)
    {
        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == PhotoKey(id, photoId), ct);
        if (row is null)
        {
            return Results.NotFound();
        }

        var mime = (http.Request.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
        if (mime is not ("image/jpeg" or "image/webp" or "image/png") || http.Request.ContentLength is not { } length || length > MaxThumbBytes)
        {
            return Results.Problem("La miniatura no es válida.", statusCode: StatusCodes.Status400BadRequest);
        }

        await store.WriteAsync(FileKey(id, photoId, thumb: true), http.Request.Body, mime, ct);
        var record = JsonSerializer.Deserialize<PhotoRecord>(row.Value, Json)!;
        row.Value = JsonSerializer.Serialize(record with { Thumb = true }, Json);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>Sirve una foto del diario de ese viaje (también para la página compartida); la miniatura si la hay y se pide.</summary>
    public static async Task<IResult> Serve(HttpContext http, AppDbContext db, IFileStore store, Guid tripId, Guid photoId, bool thumb, CancellationToken ct)
    {
        var row = await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(a => a.Key == PhotoKey(tripId, photoId), ct);
        if (row is null)
        {
            return Results.NotFound();
        }

        var hasThumb = thumb && JsonSerializer.Deserialize<PhotoRecord>(row.Value, Json)?.Thumb == true;
        var file = await store.OpenReadAsync(FileKey(tripId, photoId, hasThumb), ct);
        if (file is null)
        {
            return Results.NotFound();
        }

        http.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        return FileResponses.Serve(http, file);
    }

    private static async Task<IResult> DeletePhoto(
        Guid id, Guid photoId, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IFileStore store,
        CancellationToken ct)
    {
        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == PhotoKey(id, photoId), ct);
        if (row is not null)
        {
            db.AppSettings.Remove(row);
            await db.SaveChangesAsync(ct);
            await store.DeleteAsync(FileKey(id, photoId), ct);
            await store.DeleteAsync(FileKey(id, photoId, thumb: true), ct);
        }

        return Results.NoContent();
    }
}
