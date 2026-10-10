using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Ai;
using Viajes.Api.Data;
using Viajes.Api.Weather;

namespace Viajes.Api.Trips;

/// <summary>
/// «Sugerir lugares»: la IA configurada propone sitios del destino del viaje (qué ver, dónde comer…) que aún no estén en
/// la lista. Las ideas se guardan en el viaje (<see cref="PlaceIdea"/>) para no tener que pedirlas otra vez: cada nueva
/// petición añade ideas distintas a las que ya hay. Pasan a «Lugares» cuando alguien toca «Añadir»; «Quitar» las oculta.
/// </summary>
public static class PlaceSuggestions
{
    public const int MaxSuggestions = 12;

    public sealed record SuggestRequest(string? Lang, string? Category, string? Area = null);

    public sealed record Suggestion(string Name, string Category, string Description, string? Address, string? Area = null);

    public sealed record IdeaDto(Guid Id, string Name, string Category, string Description, string? Address, string? Area);

    private static readonly JsonElement AreasSchema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            areas = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new { name = new { type = "string" }, area = new { type = "string" } },
                    required = new[] { "name", "area" },
                    additionalProperties = false,
                },
            },
        },
        required = new[] { "areas" },
        additionalProperties = false,
    });

    private static readonly Dictionary<string, string> Languages = new()
    {
        ["es"] = "español",
        ["en"] = "English",
        ["fr"] = "français",
        ["it"] = "italiano",
    };

    private const string SystemPrompt = """
        Eres un guía local experto que recomienda sitios a una familia que prepara un viaje. Propones lugares reales y
        conocidos del destino, variados y útiles: lo imprescindible para ver, dónde comer bien (locales típicos, no cadenas),
        dónde tomar algo, compras con encanto y naturaleza cercana. Nada de sitios inventados ni cerrados.
        """;

    private static readonly JsonElement Schema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        properties = new
        {
            places = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        name = new { type = "string" },
                        category = new { type = "string", @enum = Place.Categories.ToArray() },
                        description = new { type = "string" },
                        address = new { type = new[] { "string", "null" } },
                        area = new { type = "string" },
                    },
                    required = new[] { "name", "category", "description", "address", "area" },
                    additionalProperties = false,
                },
            },
        },
        required = new[] { "places" },
        additionalProperties = false,
    });

    public static void MapPlaceSuggestions(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/trips/{id:guid}/place-suggestions", List).RequireAuthorization();
        app.MapPost("/api/trips/{id:guid}/place-suggestions", Suggest).RequireAuthorization();
        app.MapDelete("/api/trips/{id:guid}/place-suggestions/{ideaId:guid}", Dismiss).RequireAuthorization();
    }

    /// <summary>Las ideas guardadas del viaje que no se han descartado.</summary>
    private static async Task<IResult> List(
        Guid id, string? lang, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, IJsonAsker ai,
        ILoggerFactory loggers, CancellationToken ct)
    {
        var trip = await access.VisibleTrip(users.GetUserId(principal)!, id);
        if (trip is null || trip.DeletedAtMs is not null)
        {
            return Results.NotFound();
        }

        var cities = await CitiesFor(access, users.GetUserId(principal)!, id, ct);
        if (cities.Count > 0)
        {
            await FillCities(db, ai, id, cities, loggers, ct);
        }
        else
        {
            await FillAreas(db, ai, id, Languages.GetValueOrDefault(lang ?? "es", "español"), loggers, ct);
        }
        return Results.Ok(new { suggestions = await Pending(db, id, ct), added = 0, cities });
    }

    private static async Task<IResult> Dismiss(
        Guid id, Guid ideaId, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db, CancellationToken ct)
    {
        var trip = await access.VisibleTrip(users.GetUserId(principal)!, id);
        var idea = trip is null ? null : await db.PlaceIdeas.FirstOrDefaultAsync(i => i.Id == ideaId && i.TripId == id, ct);
        if (idea is null)
        {
            return Results.NotFound();
        }

        idea.DismissedAtMs ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>Lo que no está en ni cerca de ninguna ciudad del viaje (una ciudad de escala, por ejemplo).</summary>
    public const string Outside = "fuera";

    /// <summary>
    /// Las ciudades donde se está de verdad, en el orden del viaje: los destinos de vuelos y trenes, sin la vuelta a casa ni
    /// las escalas (llegar y volver a salir de la misma ciudad en menos de 8 horas). Así las ideas son de Río y no de São
    /// Paulo si solo se pasa por su aeropuerto.
    /// </summary>
    public static List<string> TripCities(IEnumerable<Booking> bookings)
    {
        var moves = bookings.Where(b => b.DeletedAtMs is null && b.Type is "flight" or "train" && b.DeletedAtMs is null)
            .OrderBy(b => b.StartUtcMs)
            .ToList();
        string? City(string? place) => string.IsNullOrWhiteSpace(place) ? null : CityName(Airports.Find(place.Trim())?.Label ?? place.Trim());
        var home = City(moves.FirstOrDefault()?.StartPlace);
        var cities = new List<string>();
        for (var i = 0; i < moves.Count; i++)
        {
            var leg = moves[i];
            var to = City(leg.EndPlace);
            if (to is null || string.Equals(to, home, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            long arrival;
            try
            {
                arrival = leg.EndLocal is { Length: >= 16 } ? LocalTime.ToUtcMs(leg.EndLocal, leg.EndTz ?? leg.StartTz) : leg.StartUtcMs;
            }
            catch (ArgumentException)
            {
                arrival = leg.StartUtcMs;
            }

            var next = moves.Skip(i + 1).FirstOrDefault(n => n.StartUtcMs > leg.StartUtcMs && !SameLeg(n, leg));
            if (next is not null && string.Equals(City(next.StartPlace), to, StringComparison.OrdinalIgnoreCase)
                && next.StartUtcMs - arrival < 8 * 3_600_000L)
            {
                continue;
            }

            if (!cities.Contains(to, StringComparer.OrdinalIgnoreCase))
            {
                cities.Add(to);
            }
        }

        return cities;
    }

    /// <summary>Nombres en español de ciudades que la tabla de aeropuertos trae en inglés o sin acentos.</summary>
    private static readonly Dictionary<string, string> SpanishNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Iguazu Falls"] = "Puerto Iguazú",
        ["Foz Do Iguacu"] = "Foz do Iguaçu",
        ["Sao Paulo"] = "São Paulo",
        ["Rio De Janeiro"] = "Río de Janeiro",
        ["Florianopolis"] = "Florianópolis",
        ["Brasilia"] = "Brasilia",
        ["Salvador"] = "Salvador de Bahía",
        ["Cordoba"] = "Córdoba",
        ["Bariloche"] = "San Carlos de Bariloche",
        ["Montevideo"] = "Montevideo",
        ["Mexico City"] = "Ciudad de México",
        ["New York"] = "Nueva York",
        ["London"] = "Londres",
        ["Lisbon"] = "Lisboa",
        ["Rome"] = "Roma",
        ["Milan"] = "Milán",
        ["Florence"] = "Florencia",
        ["Venice"] = "Venecia",
        ["Naples"] = "Nápoles",
        ["Munich"] = "Múnich",
        ["Brussels"] = "Bruselas",
        ["Geneva"] = "Ginebra",
        ["Athens"] = "Atenas",
        ["Copenhagen"] = "Copenhague",
        ["Stockholm"] = "Estocolmo",
        ["Prague"] = "Praga",
        ["Vienna"] = "Viena",
        ["Warsaw"] = "Varsovia",
        ["Tokyo"] = "Tokio",
        ["Cairo"] = "El Cairo",
        ["Marrakech"] = "Marrakech",
        ["Havana"] = "La Habana",
        ["Bogota"] = "Bogotá",
        ["Medellin"] = "Medellín",
        ["Cusco"] = "Cusco",
        ["Panama City"] = "Ciudad de Panamá",
    };

    /// <summary>«Rio De Janeiro» → «Río de Janeiro»; el resto, con «de/do/da/del» en minúscula.</summary>
    public static string CityName(string label)
    {
        if (SpanishNames.TryGetValue(label.Trim(), out var spanish))
        {
            return spanish;
        }

        var words = label.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', words.Select((w, i) => i > 0 && w.ToLowerInvariant() is "de" or "do" or "da" or "del" or "la" or "los" or "las" ? w.ToLowerInvariant() : w));
    }

    /// <summary>El mismo trayecto de otro pasajero (misma salida y ruta).</summary>
    private static bool SameLeg(Booking a, Booking b) =>
        a.StartUtcMs == b.StartUtcMs && string.Equals(a.StartPlace, b.StartPlace, StringComparison.OrdinalIgnoreCase) && string.Equals(a.EndPlace, b.EndPlace, StringComparison.OrdinalIgnoreCase);

    /// <summary>La ciudad de la lista que dice la IA (sin mirar mayúsculas ni acentos); null si no es ninguna.</summary>
    public static string? MatchCity(string? area, IReadOnlyList<string> cities)
    {
        if (string.IsNullOrWhiteSpace(area))
        {
            return null;
        }

        var key = Plain(area);
        return cities.FirstOrDefault(c => Plain(c) == key) ?? cities.FirstOrDefault(c => Plain(c).Contains(key) || key.Contains(Plain(c)));
    }

    /// <summary>Sin mayúsculas ni acentos: «São Paulo» = «sao paulo».</summary>
    private static string Plain(string text) =>
        new string(text.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD)
            .Where(ch => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray());

    private static string CitiesKey(Guid tripId) => $"ideas-cities:{tripId:N}";

    private static async Task<List<string>> CitiesFor(AccessService access, string userId, Guid tripId, CancellationToken ct) =>
        TripCities(await access.VisibleBookings(userId).Where(b => b.TripId == tripId && b.DeletedAtMs == null).ToListAsync(ct));

    /// <summary>
    /// Cuando cambian las ciudades del viaje (o la primera vez), las ideas guardadas se reparten por ciudad con la IA, una vez;
    /// las que no son de ninguna ciudad del viaje (São Paulo si solo se hace escala allí) se quitan de la lista.
    /// </summary>
    private static async Task FillCities(AppDbContext db, IJsonAsker ai, Guid tripId, IReadOnlyList<string> cities, ILoggerFactory loggers, CancellationToken ct)
    {
        var flag = string.Join("|", cities);
        var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == CitiesKey(tripId), ct);
        if (row?.Value == flag || !ai.IsAvailable)
        {
            return;
        }

        var ideas = (await db.PlaceIdeas.Where(i => i.TripId == tripId && i.DismissedAtMs == null).ToListAsync(ct))
            .Where(i => MatchCity(i.Area, cities) is null || MatchCity(i.Area, cities) != i.Area)
            .ToList();
        if (ideas.Count > 0)
        {
            var list = string.Join("\n", ideas.Select(i => $"- {i.Name}{(i.Address is null ? "" : $" ({i.Address})")}"));
            var prompt = $"""
                Ciudades del viaje: {string.Join(" | ", cities)}.
                Para cada sitio, area: la ciudad de esa lista donde está o desde la que se va de excursión en el día, escrita
                exactamente igual; «{Outside}» si no está en ninguna ni cerca. name: el nombre tal cual te lo doy.
                {list}
                """;
            Dictionary<string, string> areas;
            try
            {
                areas = ParseAreas(await ai.AskJsonAsync(SystemPrompt, prompt, AreasSchema, 2000, ct));
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                loggers.CreateLogger("Viajes.Places").LogWarning(error, "No se ha podido repartir las ideas por ciudad.");
                return;
            }

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            foreach (var idea in ideas)
            {
                if (!areas.TryGetValue(Key(idea.Name), out var area))
                {
                    continue;
                }

                if (Plain(area) == Outside)
                {
                    idea.DismissedAtMs = now;
                }
                else if (MatchCity(area, cities) is { } city)
                {
                    idea.Area = city;
                }
            }
        }

        row ??= db.AppSettings.Add(new AppSetting { Key = CitiesKey(tripId), Value = "" }).Entity;
        row.Value = flag;
        row.UpdatedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Las ideas guardadas antes de que se apuntara el país (Area null) se clasifican una vez con la IA, para poder
    /// agruparlas por país. Si no se sabe, queda vacío y no se vuelve a preguntar.
    /// </summary>
    private static async Task FillAreas(AppDbContext db, IJsonAsker ai, Guid tripId, string language, ILoggerFactory loggers, CancellationToken ct)
    {
        var missing = await db.PlaceIdeas.Where(i => i.TripId == tripId && i.Area == null).ToListAsync(ct);
        if (missing.Count == 0)
        {
            return;
        }

        var areas = new Dictionary<string, string>();
        if (ai.IsAvailable)
        {
            var list = string.Join("\n", missing.Select(i => $"- {i.Name}{(i.Address is null ? "" : $" ({i.Address})")}"));
            var prompt = $"""
                Di en qué país está cada uno de estos sitios. area: el nombre del país en {language}, siempre igual escrito.
                name: el nombre tal cual te lo doy.
                {list}
                """;
            try
            {
                areas = ParseAreas(await ai.AskJsonAsync(SystemPrompt, prompt, AreasSchema, 1500, ct));
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                loggers.CreateLogger("Viajes.Places").LogWarning(error, "No se ha podido clasificar las ideas por país.");
            }
        }

        foreach (var idea in missing)
        {
            idea.Area = areas.GetValueOrDefault(Key(idea.Name), "");
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>{"areas": [{"name", "area"}]} → nombre normalizado → país. Lo que no se entiende se ignora.</summary>
    public static Dictionary<string, string> ParseAreas(string? json)
    {
        var result = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return result;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.TryGetProperty("areas", out var areas) && areas.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in areas.EnumerateArray())
                {
                    if (Text(item, "name", 200) is { } name && Text(item, "area", 100) is { } area)
                    {
                        result[Key(name)] = area;
                    }
                }
            }
        }
        catch (JsonException)
        {
        }

        return result;
    }

    /// <summary>
    /// Todas las ideas no descartadas, también las ya añadidas a «Lugares»: la app las oculta mientras el sitio siga en la
    /// lista y las vuelve a enseñar si se quita de ahí.
    /// </summary>
    private static async Task<List<IdeaDto>> Pending(AppDbContext db, Guid tripId, CancellationToken ct)
    {
        var ideas = await db.PlaceIdeas.Where(i => i.TripId == tripId && i.DismissedAtMs == null).ToListAsync(ct);
        return ideas
            .OrderByDescending(i => i.CreatedAtMs)
            .Select(i => new IdeaDto(i.Id, i.Name, i.Category, i.Description, i.Address, string.IsNullOrEmpty(i.Area) ? null : i.Area))
            .ToList();
    }

    private static async Task<IResult> Suggest(
        Guid id, SuggestRequest? body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db,
        IJsonAsker ai, ILoggerFactory loggers, CancellationToken ct)
    {
        if (!ai.IsAvailable)
        {
            return Results.Problem("Las sugerencias con IA no están configuradas en el servidor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var userId = users.GetUserId(principal)!;
        var trip = await access.VisibleTrip(userId, id);
        if (trip is null || trip.DeletedAtMs is not null)
        {
            return Results.NotFound();
        }

        var destination = string.IsNullOrWhiteSpace(trip.Destination) ? trip.Title : trip.Destination;
        var existing = await db.Places.Where(p => p.TripId == id && p.DeletedAtMs == null).Select(p => p.Name).ToListAsync(ct);
        var known = await db.PlaceIdeas.Where(i => i.TripId == id).Select(i => i.Name).ToListAsync(ct);
        var language = Languages.GetValueOrDefault(body?.Lang ?? "es", "español");
        var category = body?.Category is { } c && Place.Categories.Contains(c) ? c : null;
        var cities = await CitiesFor(access, userId, id, ct);
        var focus = MatchCity(body?.Area, cities);
        var where = cities.Count == 0
            ? "Si el destino incluye varias ciudades o países, repártelos entre ellos."
            : focus is not null
                ? $"Todos en {focus} o en excursiones de un día desde allí."
                : $"""
                    Ciudades donde estaréis, en orden: {string.Join(", ", cities)}. Solo sitios en esas ciudades o en excursiones
                    de un día desde ellas, repartidos entre todas; nada de otras ciudades (tampoco las de escalas o conexiones).
                    """;
        var areaRule = cities.Count == 0
            ? $"area: el país donde está el sitio, en {language} («Argentina», «Brasil»…), siempre igual escrito para el mismo país."
            : $"area: la ciudad de esta lista donde está (o desde la que se va de excursión), escrita exactamente igual: {string.Join(" | ", cities)}.";

        var prompt = $"""
            Destino del viaje: {destination}
            {(trip.Title != destination ? $"Nombre del viaje: {trip.Title}\n" : "")}{(trip.StartDate is not null ? $"Fechas: {trip.StartDate} a {trip.EndDate ?? trip.StartDate}\n" : "")}
            Propón {MaxSuggestions} sitios{(category is not null ? $" de la categoría «{category}»" : ", repartidos entre las categorías")}.
            {where}
            {(existing.Count + known.Count > 0 ? $"Ya están en la lista o ya se propusieron (no los repitas): {string.Join("; ", existing.Concat(known).Take(150))}." : "")}

            Para cada sitio:
            - name: el nombre con el que se busca en Google Maps (si hace falta, con la ciudad: «Café Tortoni, Buenos Aires»).
            - category: see (ver/visitar), eat (comer), drink (tomar algo), shop (compras), nature (naturaleza), other.
            - description: una frase corta en {language} con por qué merece la pena y un consejo práctico.
            - address: barrio o dirección si la conoces con seguridad; si no, null.
            - {areaRule}
            """;

        var log = loggers.CreateLogger("Viajes.Places");
        var json = await ai.AskJsonAsync(SystemPrompt, prompt, Schema, 3000, ct);
        var suggestions = Parse(json, existing.Concat(known));
        if (suggestions is null)
        {
            log.LogWarning("Sugerencias de lugares: sin respuesta útil de la IA.");
            return Results.Problem("No se han podido conseguir sugerencias. Inténtalo dentro de un rato.", statusCode: StatusCodes.Status502BadGateway);
        }

        // Se guardan: la próxima vez que se abra el viaje siguen ahí. La primera de la tanda queda la más reciente.
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        db.PlaceIdeas.AddRange(suggestions.Select((s, index) => new PlaceIdea
        {
            Id = Guid.NewGuid(),
            TripId = id,
            Name = s.Name,
            Category = s.Category,
            Description = s.Description,
            Address = s.Address,
            Area = cities.Count == 0 ? s.Area ?? "" : MatchCity(s.Area, cities) ?? focus ?? s.Area ?? "",
            CreatedAtMs = nowMs - index,
        }));
        await db.SaveChangesAsync(ct);

        log.LogInformation("Sugerencias de lugares: {Total} para «{Destino}».", suggestions.Count, destination);
        if (cities.Count > 0)
        {
            await FillCities(db, ai, id, cities, loggers, ct);
        }
        else
        {
            await FillAreas(db, ai, id, language, loggers, ct);
        }

        return Results.Ok(new { suggestions = await Pending(db, id, ct), added = suggestions.Count, cities });
    }

    /// <summary>Lo que devuelve la IA, limpio: sin repetidos, sin los que ya están, con categorías válidas y longitudes sensatas.</summary>
    public static List<Suggestion>? Parse(string? json, IEnumerable<string> existing)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("places", out var places) || places.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var seen = new HashSet<string>(existing.Select(Key));
            var result = new List<Suggestion>();
            foreach (var item in places.EnumerateArray())
            {
                var name = Text(item, "name", 200);
                if (name is null || !seen.Add(Key(name)))
                {
                    continue;
                }

                var category = Text(item, "category", 20) is { } c && Place.Categories.Contains(c) ? c : "other";
                result.Add(new Suggestion(name, category, Text(item, "description", 500) ?? "", Text(item, "address", 300), Text(item, "area", 100)));
                if (result.Count == MaxSuggestions)
                {
                    break;
                }
            }

            return result;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Key(string name) => name.Trim().ToLowerInvariant();

    private static string? Text(JsonElement item, string property, int max)
    {
        if (!item.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var text = value.GetString()?.Trim();
        return string.IsNullOrEmpty(text) ? null : text[..Math.Min(max, text.Length)];
    }
}
