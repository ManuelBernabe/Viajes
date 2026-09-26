using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;

namespace Viajes.Api.Data;

/// <summary>
/// Regla de oro de la sincronización: cualquier fila <see cref="IVersioned"/> que se añade o se modifica
/// (un borrado lógico es una modificación) recibe una versión nueva del contador global, dentro de la misma
/// transacción que la escritura. Como SQLite escribe de una en una, el contador sale ordenado con los commits:
/// un cliente que sincronizó hasta N nunca se salta una fila con versión menor que N.
/// </summary>
public sealed class VersionInterceptor : SaveChangesInterceptor
{
    private IDbContextTransaction? _owned;

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Assign(eventData.Context!);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Assign(eventData.Context!);
        return ValueTask.FromResult(result);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        Commit();
        return result;
    }

    public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        Commit();
        return ValueTask.FromResult(result);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData) => Rollback();

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        Rollback();
        return Task.CompletedTask;
    }

    private void Assign(DbContext context)
    {
        var entries = context.ChangeTracker.Entries<IVersioned>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified)
            .ToList();
        if (entries.Count == 0)
        {
            return;
        }

        if (context.Database.CurrentTransaction is null)
        {
            _owned = context.Database.BeginTransaction();
        }

        var connection = context.Database.GetDbConnection();
        using var command = connection.CreateCommand();
        command.Transaction = context.Database.CurrentTransaction!.GetDbTransaction();
        command.CommandText = "UPDATE ChangeCounter SET Value = Value + @count WHERE Id = 1 RETURNING Value";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "@count";
        parameter.Value = entries.Count;
        command.Parameters.Add(parameter);

        var last = (long)(command.ExecuteScalar() ?? throw new InvalidOperationException("Falta la fila del contador de cambios."));
        var next = last - entries.Count + 1;
        foreach (var entry in entries)
        {
            entry.Entity.Version = next++;
        }
    }

    private void Commit()
    {
        _owned?.Commit();
        _owned?.Dispose();
        _owned = null;
    }

    private void Rollback()
    {
        try
        {
            _owned?.Rollback();
        }
        catch (DbException)
        {
            // La conexión pudo cerrarse ya; no hay nada más que deshacer.
        }
        finally
        {
            _owned?.Dispose();
            _owned = null;
        }
    }
}
