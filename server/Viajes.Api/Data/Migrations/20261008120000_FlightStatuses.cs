using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Viajes.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class FlightStatuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FlightStatuses",
                columns: table => new
                {
                    Key = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Json = table.Column<string>(type: "TEXT", nullable: false),
                    FetchedMs = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FlightStatuses", x => x.Key);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FlightStatuses");
        }
    }
}
