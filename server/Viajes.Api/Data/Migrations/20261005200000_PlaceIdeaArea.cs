using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Viajes.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PlaceIdeaArea : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Area",
                table: "PlaceIdeas",
                type: "TEXT",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Area",
                table: "PlaceIdeas");
        }
    }
}
