using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Viajes.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class BookingVisibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Visibility",
                table: "Bookings",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "household");

            // Lo que ya existe conserva su regla: las reservas de un invitado eran privadas salvo que las hubiera compartido;
            // las de quien administra las veía todo el hogar.
            migrationBuilder.Sql(
                "UPDATE Bookings SET Visibility = 'private' WHERE Shared = 0 AND CreatedBy NOT IN " +
                "(SELECT UserId FROM HouseholdMembers WHERE Role = 'admin' AND DeletedAtMs IS NULL);");

            migrationBuilder.DropColumn(
                name: "Shared",
                table: "Bookings");

            migrationBuilder.CreateTable(
                name: "BookingShares",
                columns: table => new
                {
                    BookingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookingShares", x => new { x.BookingId, x.UserId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookingShares_UserId",
                table: "BookingShares",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BookingShares");

            migrationBuilder.DropColumn(
                name: "Visibility",
                table: "Bookings");

            migrationBuilder.AddColumn<bool>(
                name: "Shared",
                table: "Bookings",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }
    }
}
