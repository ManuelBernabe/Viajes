namespace Viajes.Api.Data;

public sealed class DiagMark
{
    public Guid Id { get; set; }

    public required string UserId { get; set; }

    public required string Local { get; set; }

    public long CreatedMs { get; set; }
}
