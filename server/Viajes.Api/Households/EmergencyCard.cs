using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Households;

/// <summary>
/// «🆘 Emergencia»: lo que hace falta a mano si pasa algo en un viaje (seguro, a quién llamar en casa y, si se quiere, grupo
/// sanguíneo, alergias y medicación de cada persona). Una tarjeta por hogar, que todos ven y editan; la app la guarda
/// también en el móvil para tenerla sin conexión. Se guarda en AppSettings «emergency:{hogar}».
/// </summary>
public static class EmergencyCard
{
    public sealed record Insurance(string? Company, string? Phone, string? Policy, string? Notes);

    public sealed record Contact(string? Name, string? Relation, string? Phone);

    public sealed record Person(string? Name, string? Blood, string? Allergies, string? Medication, string? Notes);

    public sealed record Card(Insurance? Insurance, List<Contact>? Contacts, List<Person>? People, string? Notes, long? UpdatedMs = null, string? UpdatedBy = null);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static string Key(Guid householdId) => $"emergency:{householdId:N}";

    public static void MapEmergencyCard(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/household/emergency").RequireAuthorization();
        group.MapGet("", Get);
        group.MapPut("", Put);
    }

    private static async Task<IResult> Get(ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var householdId = await access.EnsureHousehold(users.GetUserId(principal)!);
        var row = await db.AppSettings.AsNoTracking().FirstOrDefaultAsync(a => a.Key == Key(householdId));
        var card = row is null ? new Card(null, [], [], null) : JsonSerializer.Deserialize<Card>(row.Value, Json)!;
        return Results.Ok(card);
    }

    private static async Task<IResult> Put(Card body, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var householdId = await access.EnsureHousehold(userId);
        var email = (await users.FindByIdAsync(userId))?.Email;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var card = Clean(body) with { UpdatedMs = now, UpdatedBy = email };
        var row = await db.AppSettings.FirstOrDefaultAsync(a => a.Key == Key(householdId));
        row ??= db.AppSettings.Add(new AppSetting { Key = Key(householdId), Value = "" }).Entity;
        row.Value = JsonSerializer.Serialize(card, Json);
        row.UpdatedMs = now;
        row.UpdatedBy = userId;
        await db.SaveChangesAsync();
        return Results.Ok(card);
    }

    private static string? Text(string? value, int max)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed[..Math.Min(max, trimmed.Length)];
    }

    /// <summary>Recorta textos, quita filas vacías y limita cuántas hay.</summary>
    public static Card Clean(Card card)
    {
        var insurance = card.Insurance is null
            ? null
            : new Insurance(Text(card.Insurance.Company, 120), Text(card.Insurance.Phone, 40), Text(card.Insurance.Policy, 80), Text(card.Insurance.Notes, 500));
        if (insurance is { Company: null, Phone: null, Policy: null, Notes: null })
        {
            insurance = null;
        }

        var contacts = (card.Contacts ?? [])
            .Select(c => new Contact(Text(c.Name, 80), Text(c.Relation, 60), Text(c.Phone, 40)))
            .Where(c => c.Name is not null || c.Phone is not null)
            .Take(10)
            .ToList();
        var people = (card.People ?? [])
            .Select(p => new Person(Text(p.Name, 80), Text(p.Blood, 10), Text(p.Allergies, 300), Text(p.Medication, 300), Text(p.Notes, 300)))
            .Where(p => p.Name is not null && (p.Blood ?? p.Allergies ?? p.Medication ?? p.Notes) is not null)
            .Take(10)
            .ToList();
        return new Card(insurance, contacts, people, Text(card.Notes, 1000));
    }
}
