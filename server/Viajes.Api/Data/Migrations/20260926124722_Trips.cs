using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Viajes.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Trips : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Attachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BookingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FileKey = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    Mime = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Size = table.Column<long>(type: "INTEGER", nullable: false),
                    QrText = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    Uploaded = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Attachments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Bookings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TripId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    StartLocal = table.Column<string>(type: "TEXT", maxLength: 19, nullable: false),
                    StartTz = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    StartPlace = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    EndLocal = table.Column<string>(type: "TEXT", maxLength: 19, nullable: true),
                    EndTz = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    EndPlace = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    StartUtcMs = table.Column<long>(type: "INTEGER", nullable: false),
                    Reference = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Address = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bookings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ChangeCounter",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false),
                    Value = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChangeCounter", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "HouseholdMembers",
                columns: table => new
                {
                    HouseholdId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HouseholdMembers", x => new { x.HouseholdId, x.UserId });
                });

            migrationBuilder.CreateTable(
                name: "Households",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    AdminUserId = table.Column<string>(type: "TEXT", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Households", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Trips",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Destination = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    StartDate = table.Column<string>(type: "TEXT", maxLength: 10, nullable: true),
                    EndDate = table.Column<string>(type: "TEXT", maxLength: 10, nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Trips", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "ChangeCounter",
                columns: new[] { "Id", "Value" },
                values: new object[] { 1, 0L });

            migrationBuilder.CreateIndex(
                name: "IX_Attachments_BookingId",
                table: "Attachments",
                column: "BookingId");

            migrationBuilder.CreateIndex(
                name: "IX_Attachments_Version",
                table: "Attachments",
                column: "Version");

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_TripId",
                table: "Bookings",
                column: "TripId");

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_Version",
                table: "Bookings",
                column: "Version");

            migrationBuilder.CreateIndex(
                name: "IX_HouseholdMembers_UserId",
                table: "HouseholdMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_HouseholdMembers_Version",
                table: "HouseholdMembers",
                column: "Version");

            migrationBuilder.CreateIndex(
                name: "IX_Households_Version",
                table: "Households",
                column: "Version");

            migrationBuilder.CreateIndex(
                name: "IX_Trips_HouseholdId",
                table: "Trips",
                column: "HouseholdId");

            migrationBuilder.CreateIndex(
                name: "IX_Trips_Version",
                table: "Trips",
                column: "Version");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Attachments");

            migrationBuilder.DropTable(
                name: "Bookings");

            migrationBuilder.DropTable(
                name: "ChangeCounter");

            migrationBuilder.DropTable(
                name: "HouseholdMembers");

            migrationBuilder.DropTable(
                name: "Households");

            migrationBuilder.DropTable(
                name: "Trips");
        }
    }
}
