using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Viajes.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class TravelDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TravelDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Person = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Number = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Country = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    IssuedDate = table.Column<string>(type: "TEXT", maxLength: 10, nullable: true),
                    ExpiryDate = table.Column<string>(type: "TEXT", maxLength: 10, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Visibility = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TravelDocuments", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TravelDocuments_HouseholdId",
                table: "TravelDocuments",
                column: "HouseholdId");

            migrationBuilder.CreateIndex(
                name: "IX_TravelDocuments_Version",
                table: "TravelDocuments",
                column: "Version");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TravelDocuments");
        }
    }
}
