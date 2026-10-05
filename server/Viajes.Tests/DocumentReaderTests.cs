using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Viajes.Api.Documents;

namespace Viajes.Tests;

public sealed class DocumentReaderTests(PlaceAiApp app) : IClassFixture<PlaceAiApp>
{
    // Ejemplos de la norma ICAO 9303.
    private static readonly string[] Passport = ["P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122F1204159ZE184226B<<<<<10"];
    private static readonly string[] IdCard = ["I<UTOD231458907<<<<<<<<<<<<<<<", "7408122F1204159UTO<<<<<<<<<<<6", "ERIKSSON<<ANNA<MARIA<<<<<<<<<<"];

    [Fact]
    public void The_machine_readable_zone_is_read_and_checked()
    {
        Assert.Equal(new Mrz.MrzData("passport", "L898902C3", "2012-04-15"), Mrz.Read(Passport));
        Assert.Equal(new Mrz.MrzData("id", "D23145890", "2012-04-15"), Mrz.Read(IdCard));
        // Con espacios y en minúsculas, como a veces lo copia el modelo, también.
        Assert.NotNull(Mrz.Read([Passport[0].ToLowerInvariant(), "L898902C3 6UTO 7408122F 1204159ZE184226B<<<<<10"]));
        // Un dígito mal leído y los controles no cuadran: no se usa.
        Assert.Null(Mrz.Read([Passport[0], Passport[1].Replace("L898902C3", "L898902C8")]));
    }

    [Fact]
    public void The_mrz_overrides_number_and_expiry_read_by_the_ai()
    {
        var json = JsonSerializer.Serialize(new
        {
            kind = "passport", givenNames = "Anna Maria", surnames = "Eriksson", number = "L89B902C3", country = "Utopía",
            issuedDate = "2007-04-16", expiryDate = "2012-04-16", mrz = Passport,
        });
        var result = DocumentReader.Parse(json)!;
        Assert.Equal("L898902C3", result.Number);
        Assert.Equal("2012-04-15", result.ExpiryDate);
        Assert.Equal("2007-04-16", result.IssuedDate);
        Assert.True(result.MrzChecked);

        var noMrz = DocumentReader.Parse("""{"kind": "insurance", "givenNames": null, "surnames": null, "number": "POL 4455", "country": "España", "issuedDate": null, "expiryDate": "31/12/2026", "mrz": []}""")!;
        Assert.Equal("POL4455", noMrz.Number);
        Assert.Null(noMrz.ExpiryDate);
        Assert.False(noMrz.MrzChecked);
        Assert.Null(DocumentReader.Parse("""{"kind": null, "givenNames": null, "surnames": null, "number": null, "country": null, "issuedDate": null, "expiryDate": null, "mrz": []}"""));
        Assert.Null(DocumentReader.Parse("no es json"));
    }

    [Fact]
    public async Task The_endpoint_reads_a_photo_with_the_ai()
    {
        var ana = await TripsApi.SignUp(app, "leer-documento@example.com");
        var previous = app.Fake.Answer;
        app.Fake.Answer = JsonSerializer.Serialize(new
        {
            kind = "passport", givenNames = "Anna Maria", surnames = "Eriksson", number = (string?)null, country = "Utopía",
            issuedDate = (string?)null, expiryDate = (string?)null, mrz = Passport,
        });
        try
        {
            using var content = new ByteArrayContent([0xFF, 0xD8, 0xFF, 0xE0]);
            content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            var response = await ana.Client.PostAsync("/api/documents/read", content);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
            Assert.Equal("L898902C3", body.GetProperty("number").GetString());
            Assert.Equal("Anna Maria", body.GetProperty("givenNames").GetString());
            Assert.Contains("caducidad", app.Fake.Prompts.Last());

            using var text = new StringContent("hola");
            Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await ana.Client.PostAsync("/api/documents/read", text)).StatusCode);
        }
        finally
        {
            app.Fake.Answer = previous;
        }
    }
}
