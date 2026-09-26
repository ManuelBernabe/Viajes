using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Viajes.Api.Access;
using Viajes.Api.Data;

namespace Viajes.Tests;

// La regla de oro de la sincronización: toda escritura, incluido el borrado de una fila antigua,
// recibe una versión nueva y mayor que todas las anteriores.
public sealed class ChangeVersionTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Deleting_an_old_row_gives_it_a_newer_version_than_everything_else()
    {
        var householdId = await NewHousehold("old-row");
        var oldTrip = await AddTrip(householdId, "Viaje antiguo");
        for (var i = 0; i < 10; i++)
        {
            await AddTrip(householdId, $"Viaje {i}");
        }

        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var trip = await db.Trips.SingleAsync(t => t.Id == oldTrip);
            trip.DeletedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await db.SaveChangesAsync();
        }

        using var check = app.Services.CreateScope();
        var checkDb = check.ServiceProvider.GetRequiredService<AppDbContext>();
        var deleted = await checkDb.Trips.SingleAsync(t => t.Id == oldTrip);
        var maxOther = await checkDb.Trips.Where(t => t.Id != oldTrip).MaxAsync(t => t.Version);

        Assert.NotNull(deleted.DeletedAtMs);
        Assert.True(deleted.Version > maxOther, $"borrada={deleted.Version}, resto={maxOther}");
    }

    [Fact]
    public async Task Every_saved_change_bumps_the_global_counter()
    {
        var householdId = await NewHousehold("counter");
        var tripId = await AddTrip(householdId, "Uno");
        var created = await VersionOf(tripId);

        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var trip = await db.Trips.SingleAsync(t => t.Id == tripId);
            trip.Title = "Uno editado";
            await db.SaveChangesAsync();
        }

        var edited = await VersionOf(tripId);
        Assert.True(edited > created, $"editada={edited}, creada={created}");

        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var trip = await db.Trips.SingleAsync(t => t.Id == tripId);
            trip.DeletedAtMs = 1;
            await db.SaveChangesAsync();
        }

        Assert.True(await VersionOf(tripId) > edited);
    }

    [Fact]
    public async Task Rows_saved_together_get_distinct_consecutive_versions()
    {
        var householdId = await NewHousehold("batch");
        Guid a = Guid.NewGuid(), b = Guid.NewGuid(), c = Guid.NewGuid();

        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Trips.AddRange(
                new Trip { Id = a, HouseholdId = householdId, Title = "a", CreatedBy = "u" },
                new Trip { Id = b, HouseholdId = householdId, Title = "b", CreatedBy = "u" },
                new Trip { Id = c, HouseholdId = householdId, Title = "c", CreatedBy = "u" });
            await db.SaveChangesAsync();
        }

        var versions = new[] { await VersionOf(a), await VersionOf(b), await VersionOf(c) }.Order().ToArray();
        Assert.Equal(versions[0] + 1, versions[1]);
        Assert.Equal(versions[1] + 1, versions[2]);
    }

    [Fact]
    public async Task A_failed_save_leaves_no_rows_behind()
    {
        var householdId = await NewHousehold("failed");
        var existing = await AddTrip(householdId, "ya existe");
        var other = Guid.NewGuid();

        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // La segunda fila choca en la base con la clave ya guardada: todo el guardado debe deshacerse.
            db.Trips.Add(new Trip { Id = other, HouseholdId = householdId, Title = "nueva", CreatedBy = "u" });
            db.Trips.Add(new Trip { Id = existing, HouseholdId = householdId, Title = "duplicada", CreatedBy = "u" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }

        using var check = app.Services.CreateScope();
        var checkDb = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(0, await checkDb.Trips.CountAsync(t => t.Id == other));
        Assert.Equal("ya existe", (await checkDb.Trips.SingleAsync(t => t.Id == existing)).Title);

        // Y el siguiente guardado sigue funcionando.
        await AddTrip(householdId, "después");
    }

    private async Task<Guid> NewHousehold(string user)
    {
        using var scope = app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AccessService>().EnsureHousehold(user);
    }

    private async Task<Guid> AddTrip(Guid householdId, string title)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var trip = new Trip { Id = Guid.NewGuid(), HouseholdId = householdId, Title = title, CreatedBy = "u" };
        db.Trips.Add(trip);
        await db.SaveChangesAsync();
        return trip.Id;
    }

    private async Task<long> VersionOf(Guid tripId)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return (await db.Trips.SingleAsync(t => t.Id == tripId)).Version;
    }
}
