using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Households;

public enum InvitationState
{
    Valid,
    Unknown,
    Expired,
    Used,
    Revoked,
}

public sealed record InvitationLookup(InvitationState State, Invitation? Invitation, Household? Household, string? InvitedByEmail);

public enum AcceptOutcome
{
    Joined,
    AlreadyMember,
    Invalid,
    /// <summary>La cuenta ya tiene viajes en otro hogar; unirse los dejaría fuera de la vista.</summary>
    HasOwnTrips,
}

/// <summary>Crea, consulta y canjea invitaciones al hogar. Cualquier miembro puede invitar.</summary>
public sealed class InvitationService(AppDbContext db, AccessService access)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    /// <summary>Crea una invitación y devuelve el token en claro, que solo se muestra una vez.</summary>
    public async Task<(Invitation Invitation, string Token)> Create(Guid householdId, string userId)
    {
        var token = Base64Url(RandomNumberGenerator.GetBytes(16));
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            HouseholdId = householdId,
            TokenHash = Hash(token),
            CreatedBy = userId,
            CreatedMs = now,
            ExpiresMs = now + (long)Lifetime.TotalMilliseconds,
        };
        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();
        return (invitation, token);
    }

    public async Task<InvitationLookup> Lookup(string token)
    {
        var invitation = await db.Invitations.FirstOrDefaultAsync(i => i.TokenHash == Hash(token));
        if (invitation is null)
        {
            return new InvitationLookup(InvitationState.Unknown, null, null, null);
        }

        var household = await db.Households.FirstOrDefaultAsync(h => h.Id == invitation.HouseholdId);
        var inviter = await db.Users.Where(u => u.Id == invitation.CreatedBy).Select(u => u.Email).FirstOrDefaultAsync();
        var state = StateOf(invitation, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        return new InvitationLookup(state, invitation, household, inviter);
    }

    public static InvitationState StateOf(Invitation invitation, long nowMs)
    {
        if (invitation.RevokedMs is not null)
        {
            return InvitationState.Revoked;
        }

        if (invitation.UsedMs is not null)
        {
            return InvitationState.Used;
        }

        return invitation.ExpiresMs < nowMs ? InvitationState.Expired : InvitationState.Valid;
    }

    /// <summary>
    /// Canjea la invitación para <paramref name="userId"/>: marca el token como usado (una sola vez, aunque
    /// dos peticiones lleguen a la vez) y mueve a la persona a ese hogar. Su hogar anterior tiene que estar vacío.
    /// </summary>
    public async Task<(AcceptOutcome Outcome, Household? Household)> Accept(string token, string userId)
    {
        var lookup = await Lookup(token);
        if (lookup.State != InvitationState.Valid || lookup.Invitation is null || lookup.Household is null || lookup.Household.DeletedAtMs is not null)
        {
            return (AcceptOutcome.Invalid, null);
        }

        var invitation = lookup.Invitation;
        var alreadyMember = await db.HouseholdMembers.AnyAsync(m => m.HouseholdId == invitation.HouseholdId && m.UserId == userId && m.DeletedAtMs == null);
        if (alreadyMember)
        {
            return (AcceptOutcome.AlreadyMember, lookup.Household);
        }

        var current = await access.HouseholdOf(userId);
        if (current is not null)
        {
            var hasTrips = await db.Trips.AnyAsync(t => t.HouseholdId == current.Value && t.DeletedAtMs == null);
            if (hasTrips)
            {
                return (AcceptOutcome.HasOwnTrips, null);
            }
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // El UPDATE condicional es atómico en SQLite: solo una petición consigue marcar el token como usado.
        var claimed = await db.Invitations
            .Where(i => i.Id == invitation.Id && i.UsedMs == null && i.RevokedMs == null)
            .ExecuteUpdateAsync(set => set.SetProperty(i => i.UsedMs, now).SetProperty(i => i.UsedBy, userId));
        if (claimed == 0)
        {
            return (AcceptOutcome.Invalid, null);
        }

        var previous = await db.HouseholdMembers.Where(m => m.UserId == userId && m.DeletedAtMs == null).ToListAsync();
        foreach (var membership in previous)
        {
            membership.DeletedAtMs = now;
        }

        db.HouseholdMembers.Add(new HouseholdMember
        {
            HouseholdId = invitation.HouseholdId,
            UserId = userId,
            Role = HouseholdMember.Member,
        });
        await db.SaveChangesAsync();
        return (AcceptOutcome.Joined, lookup.Household);
    }

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
