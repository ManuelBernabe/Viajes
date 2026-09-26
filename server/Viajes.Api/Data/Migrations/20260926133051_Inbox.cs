using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Viajes.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Inbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ImportTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    TokenHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    CreatedMs = table.Column<long>(type: "INTEGER", nullable: false),
                    RevokedMs = table.Column<long>(type: "INTEGER", nullable: true),
                    LastUsedMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportTokens", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InboxAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    InboxItemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FileKey = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    Mime = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Size = table.Column<long>(type: "INTEGER", nullable: false),
                    QrText = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboxAttachments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InboxItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ImportedBy = table.Column<string>(type: "TEXT", nullable: false),
                    MessageId = table.Column<string>(type: "TEXT", maxLength: 998, nullable: false),
                    FromAddress = table.Column<string>(type: "TEXT", maxLength: 320, nullable: false),
                    Subject = table.Column<string>(type: "TEXT", maxLength: 998, nullable: false),
                    ReceivedMs = table.Column<long>(type: "INTEGER", nullable: false),
                    SuggestedType = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedTitle = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedStartLocal = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedStartTz = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedStartPlace = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedEndLocal = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedEndTz = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedEndPlace = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedReference = table.Column<string>(type: "TEXT", nullable: true),
                    SuggestedAddress = table.Column<string>(type: "TEXT", nullable: true),
                    BodyText = table.Column<string>(type: "TEXT", nullable: true),
                    RawFileKey = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    BookingId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboxItems", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportTokens_TokenHash",
                table: "ImportTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ImportTokens_UserId",
                table: "ImportTokens",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_InboxAttachments_InboxItemId",
                table: "InboxAttachments",
                column: "InboxItemId");

            migrationBuilder.CreateIndex(
                name: "IX_InboxItems_HouseholdId_MessageId",
                table: "InboxItems",
                columns: new[] { "HouseholdId", "MessageId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InboxItems_Version",
                table: "InboxItems",
                column: "Version");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ImportTokens");

            migrationBuilder.DropTable(
                name: "InboxAttachments");

            migrationBuilder.DropTable(
                name: "InboxItems");
        }
    }
}
