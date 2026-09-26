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
