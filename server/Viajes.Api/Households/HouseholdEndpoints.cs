using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Auth;
using Viajes.Api.Data;

namespace Viajes.Api.Households;

public static class HouseholdEndpoints
{
    public sealed record MemberDto(string UserId, string? Email, string Role, bool Me);

    public sealed record InvitationDto(Guid Id, string? CreatedByEmail, long CreatedMs, long ExpiresMs);

    public sealed record HouseholdDto(Guid Id, string Name, bool IAmAdmin, List<MemberDto> Members, List<InvitationDto> Invitations);

    public static IServiceCollection AddHouseholds(this IServiceCollection services)
    {
        services.AddScoped<InvitationService>();
        return services;
    }

    public static void MapHouseholdEndpoints(this IEndpointRouteBuilder app)
    {
        var household = app.MapGroup("/api/household").RequireAuthorization();
        household.MapGet("/", GetHousehold);
        household.MapPost("/invitations", CreateInvitation);
        household.MapDelete("/invitations/{id:guid}", RevokeInvitation);
        household.MapDelete("/members/{userId}", RemoveMember);

        // Quien recibe el enlace aún no tiene sesión: la consulta es anónima pero con límite de intentos.
        app.MapGet("/api/invitations/{token}", LookupInvitation).RequireRateLimiting(AuthSetup.RateLimitPolicy);
        app.MapPost("/api/invitations/{token}/accept", AcceptInvitation).RequireAuthorization().RequireRateLimiting(AuthSetup.RateLimitPolicy);
    }

    private static async Task<IResult> GetHousehold(ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var householdId = await access.EnsureHousehold(userId);
        var home = await db.Households.FirstAsync(h => h.Id == householdId);
        var memberships = await db.HouseholdMembers.Where(m => m.HouseholdId == householdId && m.DeletedAtMs == null).ToListAsync();
        var ids = memberships.Select(m => m.UserId).ToList();
        var emails = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Email);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var invitations = await db.Invitations
            .Where(i => i.HouseholdId == householdId && i.UsedMs == null && i.RevokedMs == null && i.ExpiresMs >= now)
            .OrderBy(i => i.CreatedMs)
            .ToListAsync();
        var inviterIds = invitations.Select(i => i.CreatedBy).Distinct().ToList();
        var inviters = await db.Users.Where(u => inviterIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Email);

        return Results.Ok(new HouseholdDto(
            home.Id,
            home.Name,
            memberships.Any(m => m.UserId == userId && m.Role == HouseholdMember.Admin),
            memberships
                .OrderBy(m => m.Role == HouseholdMember.Admin ? 0 : 1)
                .ThenBy(m => emails.GetValueOrDefault(m.UserId))
                .Select(m => new MemberDto(m.UserId, emails.GetValueOrDefault(m.UserId), m.Role, m.UserId == userId))
                .ToList(),
            invitations.Select(i => new InvitationDto(i.Id, inviters.GetValueOrDefault(i.CreatedBy), i.CreatedMs, i.ExpiresMs)).ToList()));
    }

    private static async Task<IResult> CreateInvitation(ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, InvitationService invitations)
    {
        var userId = users.GetUserId(principal)!;
        var householdId = await access.EnsureHousehold(userId);
        var (invitation, token) = await invitations.Create(householdId, userId);
        return Results.Ok(new { id = invitation.Id, token, expiresMs = invitation.ExpiresMs });
    }

    private static async Task<IResult> RevokeInvitation(Guid id, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var userId = users.GetUserId(principal)!;
        var householdId = await access.EnsureHousehold(userId);
        var invitation = await db.Invitations.FirstOrDefaultAsync(i => i.Id == id && i.HouseholdId == householdId);
        if (invitation is null)
        {
            return Results.NotFound();
        }

        invitation.RevokedMs ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// <summary>Solo quien administra el hogar quita miembros; a sí mismo no puede. Quien sale vuelve a un hogar vacío al entrar.</summary>
    private static async Task<IResult> RemoveMember(string userId, ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, AppDbContext db)
    {
        var me = users.GetUserId(principal)!;
        var householdId = await access.EnsureHousehold(me);
        var mine = await db.HouseholdMembers.FirstAsync(m => m.HouseholdId == householdId && m.UserId == me && m.DeletedAtMs == null);
        if (mine.Role != HouseholdMember.Admin)
        {
            return Results.Problem("Solo quien administra el hogar puede quitar miembros.", statusCode: StatusCodes.Status403Forbidden);
        }

        if (userId == me)
        {
            return Results.Problem("No puedes quitarte a ti mismo del hogar que administras.", statusCode: StatusCodes.Status400BadRequest);
        }

        var member = await db.HouseholdMembers.FirstOrDefaultAsync(m => m.HouseholdId == householdId && m.UserId == userId && m.DeletedAtMs == null);
        if (member is null)
        {
            return Results.NotFound();
        }

        member.DeletedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> LookupInvitation(string token, InvitationService invitations)
    {
        var lookup = await invitations.Lookup(token);
        return Results.Ok(new
        {
            state = lookup.State.ToString().ToLowerInvariant(),
            householdName = lookup.Household?.Name,
            invitedBy = lookup.InvitedByEmail,
            expiresMs = lookup.Invitation?.ExpiresMs,
        });
    }

    private static async Task<IResult> AcceptInvitation(string token, ClaimsPrincipal principal, UserManager<IdentityUser> users, InvitationService invitations)
    {
        var userId = users.GetUserId(principal)!;
        var (outcome, household) = await invitations.Accept(token, userId);
        return outcome switch
        {
            AcceptOutcome.Joined or AcceptOutcome.AlreadyMember => Results.Ok(new { householdName = household!.Name, alreadyMember = outcome == AcceptOutcome.AlreadyMember }),
            AcceptOutcome.HasOwnTrips => Results.Problem(
                "Esta cuenta ya tiene viajes en su propio hogar. Bórralos o usa otra cuenta para unirte.",
                statusCode: StatusCodes.Status409Conflict),
            _ => Results.Problem("La invitación no es válida, ha caducado o ya se ha usado.", statusCode: StatusCodes.Status410Gone),
        };
    }
}
