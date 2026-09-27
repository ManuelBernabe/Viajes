using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Viajes.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class TokenScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Scope",
                table: "ImportTokens",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "import");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Scope",
                table: "ImportTokens");
        }
    }
}
