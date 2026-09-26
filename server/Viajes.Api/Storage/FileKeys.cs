using System.Text.RegularExpressions;

namespace Viajes.Api.Storage;

public static partial class FileKeys
{
    public static bool IsValid(string key) => SafeKey().IsMatch(key);

    [GeneratedRegex("^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$")]
    private static partial Regex SafeKey();
}
