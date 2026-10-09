using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Api.Ai;

/// <summary>
/// «Ajustes → IA» (solo quien administra): qué proveedor y qué modelos usa el servidor (lo decide la clave que haya en
/// Railway) y cuánto se está ahorrando con la caché.
/// </summary>
public static class AiStatus
{
    public sealed record StatusDto(string Provider, string? Model, string? LightModel, int CachedAnswers, long Hits, long Misses);

    public static (string Provider, string? Model, string? LightModel) Describe(IBookingExtractor extractor, IConfiguration config)
    {
        var inner = extractor is CachedAi cached ? cached.Inner : extractor;
        return inner switch
        {
            ClaudeBookingExtractor claude => ("Claude (Anthropic)", claude.Model, claude.LightModel),
            GeminiBookingExtractor => ("Gemini (Google)", config["GEMINI_MODEL"] ?? GeminiBookingExtractor.ModelId, null),
            DeepSeekBookingExtractor => ("DeepSeek", DeepSeekBookingExtractor.ModelId, null),
            _ => ("Sin IA", null, null),
        };
    }

    public static void MapAiStatus(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/settings/ai", async (
            ClaimsPrincipal principal, UserManager<IdentityUser> users, AccessService access, IBookingExtractor extractor, IConfiguration config, AppDbContext db) =>
        {
            if (!await access.IsAdmin(users.GetUserId(principal)!))
            {
                return Results.Problem("Solo quien administra el hogar puede ver esto.", statusCode: StatusCodes.Status403Forbidden);
            }

            var (provider, model, light) = Describe(extractor, config);
            var cachedAnswers = await db.AppSettings.CountAsync(a => a.Key.StartsWith("ai:"));
            return Results.Ok(new StatusDto(provider, model, light, cachedAnswers, CachedAi.Hits, CachedAi.Misses));
        }).RequireAuthorization();
    }
}
