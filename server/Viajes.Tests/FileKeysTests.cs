using Viajes.Api.Storage;

namespace Viajes.Tests;

public sealed class FileKeysTests
{
    [Theory]
    [InlineData("diag/3f2a-9c/probe", true)]
    [InlineData("../fuera", false)]
    [InlineData("a//b", false)]
    [InlineData("", false)]
    [InlineData("diag/probe.txt", false)]
    public void Only_safe_keys_are_valid(string key, bool expected)
    {
        Assert.Equal(expected, FileKeys.IsValid(key));
    }
}
