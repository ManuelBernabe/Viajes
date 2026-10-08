using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Trips;

/// <summary>
/// «Itinerario para compartir»: un enlace de solo lectura por viaje (/i/{token}) que se puede mandar a quien no usa la
/// app (la familia que se queda en casa). Solo muestra las reservas que ve todo el hogar, sin localizadores, notas ni
/// adjuntos; se puede imprimir o guardar como PDF y se revoca cuando se quiera (el enlace deja de funcionar).
/// Se guarda en AppSettings: «share:{token}» → «{tripId}|{idioma}» y «shareof:{tripId}» → token.
/// </summary>
public static class ItineraryShare
{
    public sealed record ShareDto(string? Token, string? Url, string? Lang);

    public sealed record ShareRequest(string? Lang);

    private static readonly HashSet<string> Langs = ["es", "en", "fr", "it"];

    public static string TokenKey(string token) => $"share:{token}";

    public static string TripKey(Guid tripId) => $"shareof:{tripId:N}";

    public static void MapItineraryShare(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/trips/{id:guid}/share").RequireAuthorization();
        group.MapGet("", Get);
        group.MapPost("", Create);
        group.MapDelete("", Revoke);
        app.MapGet("/i/{token}", Page).AllowAnonymous();
    }

    private static string UrlFor(HttpRequest request, string token) => $"{request.Scheme}://{request.Host}/i/{token}";

    private static async Task<Trip?> TripFor(Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access)
    {
        var trip = await access.VisibleTrip(users.GetUserId(principal)!, id);
        return trip is null || trip.DeletedAtMs is not null ? null : trip;
    }

    private static async Task<IResult> Get(Guid id, HttpRequest request, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var token = (await db.AppSettings.FirstOrDefaultAsync(a => a.Key == TripKey(id)))?.Value;
        var lang = token is null ? null : (await db.AppSettings.FirstOrDefaultAsync(a => a.Key == TokenKey(token)))?.Value.Split('|').ElementAtOrDefault(1);
        return Results.Ok(new ShareDto(token, token is null ? null : UrlFor(request, token), lang));
    }

    private static async Task<IResult> Create(
        Guid id, ShareRequest body, HttpRequest request, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var userId = users.GetUserId(principal)!;
        var lang = Langs.Contains(body.Lang ?? "") ? body.Lang! : "es";
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var existing = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == TripKey(id));
        if (existing is not null)
        {
            // Ya hay enlace: el mismo, con el idioma de ahora.
            var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == TokenKey(existing.Value));
            if (row is not null)
            {
                row.Value = $"{id:N}|{lang}";
                row.UpdatedMs = now;
                await db.SaveChangesAsync();
                return Results.Ok(new ShareDto(existing.Value, UrlFor(request, existing.Value), lang));
            }

            db.AppSettings.Remove(existing);
        }

        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(18));
        db.AppSettings.Add(new AppSetting { Key = TokenKey(token), Value = $"{id:N}|{lang}", UpdatedMs = now, UpdatedBy = userId });
        db.AppSettings.Add(new AppSetting { Key = TripKey(id), Value = token, UpdatedMs = now, UpdatedBy = userId });
        await db.SaveChangesAsync();
        return Results.Ok(new ShareDto(token, UrlFor(request, token), lang));
    }

    private static async Task<IResult> Revoke(Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        if (await TripFor(id, principal, users, access) is null)
        {
            return Results.NotFound();
        }

        var existing = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == TripKey(id));
        if (existing is not null)
        {
            db.AppSettings.RemoveRange(db.AppSettings.Where(a => a.Key == TokenKey(existing.Value)));
            db.AppSettings.Remove(existing);
            await db.SaveChangesAsync();
        }

        return Results.NoContent();
    }

    private static async Task<IResult> Page(string token, HttpContext context, AppDbContext db)
    {
        var row = token.Length is > 10 and < 64 ? await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(a => a.Key == TokenKey(token)) : null;
        var parts = row?.Value.Split('|');
        Trip? trip = null;
        if (parts is { Length: 2 } && Guid.TryParseExact(parts[0], "N", out var tripId))
        {
            trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tripId && t.DeletedAtMs == null);
        }

        var nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(12));
        var headers = context.Response.Headers;
        headers["Content-Security-Policy"] =
            $"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
        headers["X-Robots-Tag"] = "noindex, nofollow";
        headers["Referrer-Policy"] = "no-referrer";
        headers.CacheControl = "no-store";
        if (trip is null)
        {
            return Results.Content(Html.NotFound(parts?.ElementAtOrDefault(1) ?? "es"), "text/html; charset=utf-8", Encoding.UTF8, StatusCodes.Status404NotFound);
        }

        var bookings = await db.Bookings.AsNoTracking()
            .Where(b => b.TripId == trip.Id && b.DeletedAtMs == null && b.Visibility == Booking.VisibleToHousehold)
            .OrderBy(b => b.StartUtcMs)
            .ToListAsync();
        return Results.Content(Html.Render(trip, bookings, parts![1], nonce), "text/html; charset=utf-8", Encoding.UTF8);
    }

    /// <summary>La página, en HTML sencillo (sin la app): se ve en cualquier móvil y se imprime bien.</summary>
    public static class Html
    {
        private static readonly Dictionary<string, Dictionary<string, string>> Texts = new()
        {
            ["es"] = new() { ["print"] = "Imprimir o guardar PDF", ["empty"] = "Todavía no hay reservas en este itinerario.", ["gone"] = "Este enlace ya no está disponible.", ["foot"] = "Itinerario compartido desde Viajes. Las horas son locales de cada sitio.", ["until"] = "hasta", ["checkin"] = "Entrada", ["checkout"] = "Salida" },
            ["en"] = new() { ["print"] = "Print or save as PDF", ["empty"] = "There are no bookings in this itinerary yet.", ["gone"] = "This link is no longer available.", ["foot"] = "Itinerary shared from Viajes. Times are local to each place.", ["until"] = "until", ["checkin"] = "Check-in", ["checkout"] = "Check-out" },
            ["fr"] = new() { ["print"] = "Imprimer ou enregistrer en PDF", ["empty"] = "Il n’y a pas encore de réservations dans cet itinéraire.", ["gone"] = "Ce lien n’est plus disponible.", ["foot"] = "Itinéraire partagé depuis Viajes. Les heures sont locales à chaque lieu.", ["until"] = "jusqu’au", ["checkin"] = "Arrivée", ["checkout"] = "Départ" },
            ["it"] = new() { ["print"] = "Stampa o salva PDF", ["empty"] = "Non ci sono ancora prenotazioni in questo itinerario.", ["gone"] = "Questo link non è più disponibile.", ["foot"] = "Itinerario condiviso da Viajes. Gli orari sono locali di ogni luogo.", ["until"] = "fino al", ["checkin"] = "Check-in", ["checkout"] = "Check-out" },
        };

        private static readonly Dictionary<string, string[]> Days = new()
        {
            ["es"] = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
            ["en"] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            ["fr"] = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
            ["it"] = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
        };

        private static readonly Dictionary<string, string[]> Months = new()
        {
            ["es"] = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
            ["en"] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
            ["fr"] = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
            ["it"] = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
        };

        private static readonly Dictionary<string, string> Icons = new()
        {
            ["flight"] = "✈️", ["hotel"] = "🏨", ["train"] = "🚆", ["car"] = "🚗", ["ticket"] = "🎟️", ["other"] = "📌",
        };

        private static string L(string lang) => Texts.ContainsKey(lang) ? lang : "es";

        private static string E(string? text) => WebUtility.HtmlEncode(text ?? "");

        public static string LongDay(string date, string lang)
        {
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var d))
            {
                return date;
            }

            lang = L(lang);
            var day = Days[lang][(int)d.DayOfWeek];
            var month = Months[lang][d.Month - 1];
            return lang switch
            {
                "en" => $"{day}, {month} {d.Day}, {d.Year}",
                "es" => $"{day}, {d.Day} de {month} de {d.Year}",
                _ => $"{day} {d.Day} {month} {d.Year}",
            };
        }

        private static string ShortDay(string date, string lang)
        {
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var d))
            {
                return date;
            }

            var month = Months[L(lang)][d.Month - 1];
            return L(lang) == "en" ? $"{month} {d.Day}" : $"{d.Day} {month}";
        }

        private static string Time(string? local) => local is { Length: >= 16 } ? local[11..16] : "";

        private const string Style = """
            :root{color-scheme:light dark;--bg:#eef1f5;--card:#fff;--text:#12213a;--muted:#5e6b80;--line:#dce2ea;--accent:#2457c5}
            @media (prefers-color-scheme:dark){:root{--bg:#0e1420;--card:#161e2c;--text:#e8edf5;--muted:#8d99ad;--line:#26324a;--accent:#7aa2ff}}
            *{box-sizing:border-box}body{margin:0;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text)}
            main{max-width:720px;margin:0 auto;padding:20px 16px 40px}h1{margin:0 0 4px;font-size:1.6rem}.muted{color:var(--muted)}
            h2{font-size:1rem;margin:22px 0 8px;color:var(--accent)}
            .b{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:12px;padding:10px 12px;margin:8px 0;break-inside:avoid}
            .t{font-weight:800;font-size:1.15rem;min-width:3.2em}.i{font-size:1.2rem}.ti{font-weight:600}.s{color:var(--muted);font-size:.92rem}
            .flight{border-left-color:#2f7ff0}.hotel{border-left-color:#8a5cf6}.train{border-left-color:#16a34a}.car{border-left-color:#ea8a0c}.ticket{border-left-color:#e0457b}
            button{font:inherit;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text);margin-top:12px}
            footer{margin-top:28px;font-size:.85rem;color:var(--muted)}
            @media print{:root{--bg:#fff;--card:#fff;--text:#000;--muted:#444;--line:#bbb}button{display:none}main{padding:0}}
            """;

        private static string Doc(string lang, string title, string body, string? nonce) => $"""
            <!doctype html><html lang="{L(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="robots" content="noindex,nofollow"><title>{E(title)}</title><style>{Style}</style></head>
            <body><main>{body}</main>{(nonce is null ? "" : $"<script nonce=\"{nonce}\">document.getElementById('p').addEventListener('click',function(){{window.print()}})</script>")}</body></html>
            """;

        public static string NotFound(string lang) => Doc(lang, "Viajes", $"<p>{E(Texts[L(lang)]["gone"])}</p>", null);

        public static string Render(Trip trip, IReadOnlyList<Booking> bookings, string lang, string nonce)
        {
            lang = L(lang);
            var text = Texts[lang];
            var html = new StringBuilder();
            html.Append($"<h1>{E(trip.Title)}</h1>");
            var dates = trip.StartDate is null ? "" : trip.EndDate is null || trip.EndDate == trip.StartDate
                ? LongDay(trip.StartDate, lang)
                : $"{ShortDay(trip.StartDate, lang)} – {LongDay(trip.EndDate, lang)}";
            var sub = string.Join(" · ", new[] { trip.Destination, dates }.Where(s => !string.IsNullOrWhiteSpace(s)));
            if (sub.Length > 0)
            {
                html.Append($"<div class=\"muted\">{E(sub)}</div>");
            }

            html.Append($"<button id=\"p\" type=\"button\">🖨️ {E(text["print"])}</button>");
            if (bookings.Count == 0)
            {
                html.Append($"<p class=\"muted\">{E(text["empty"])}</p>");
            }

            foreach (var day in bookings.GroupBy(b => b.StartLocal[..Math.Min(10, b.StartLocal.Length)]))
            {
                var heading = LongDay(day.Key, lang);
                html.Append($"<h2>{E(char.ToUpperInvariant(heading[0]) + heading[1..])}</h2>");
                foreach (var b in day)
                {
                    var type = Icons.ContainsKey(b.Type) ? b.Type : "other";
                    var details = new List<string>();
                    if (b.Type == "hotel")
                    {
                        details.Add($"{text["checkin"]} {Time(b.StartLocal)}" + (b.EndLocal is { Length: >= 10 } ? $" · {text["checkout"]} {ShortDay(b.EndLocal[..10], lang)} {Time(b.EndLocal)}" : ""));
                        details.Add(b.Address ?? b.StartPlace ?? "");
                    }
                    else
                    {
                        var route = string.Join(" → ", new[] { b.StartPlace, b.EndPlace }.Where(p => !string.IsNullOrWhiteSpace(p)));
                        var end = b.EndLocal is { Length: >= 16 }
                            ? (b.EndLocal[..10] == day.Key ? $" – {Time(b.EndLocal)}" : $" – {ShortDay(b.EndLocal[..10], lang)} {Time(b.EndLocal)}")
                            : "";
                        details.Add($"{Time(b.StartLocal)}{end}" + (route.Length > 0 ? $" · {route}" : ""));
                        if (!string.IsNullOrWhiteSpace(b.Address))
                        {
                            details.Add(b.Address);
                        }
                    }

                    html.Append($"<div class=\"b {type}\"><div class=\"t\">{E(Time(b.StartLocal))}</div><div><div class=\"ti\"><span class=\"i\">{Icons[type]}</span> {E(b.Title)}</div>");
                    foreach (var d in details.Where(d => !string.IsNullOrWhiteSpace(d)))
                    {
                        html.Append($"<div class=\"s\">{E(d)}</div>");
                    }

                    html.Append("</div></div>");
                }
            }

            html.Append($"<footer>{E(text["foot"])}</footer>");
            return Doc(lang, trip.Title, html.ToString(), nonce);
        }
    }
}
