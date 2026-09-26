using Microsoft.AspNetCore.Identity;

namespace Viajes.Api.Auth;

public static class IdentityMessages
{
    public static string Describe(IEnumerable<IdentityError> errors)
    {
        var codes = errors.Select(e => e.Code).ToList();

        if (codes.Any(c => c is "DuplicateUserName" or "DuplicateEmail"))
        {
            return "Ya existe una cuenta con ese email.";
        }

        if (codes.Any(c => c is "InvalidEmail" or "InvalidUserName"))
        {
            return "El email no es válido.";
        }

        if (codes.Any(c => c.StartsWith("Password", StringComparison.Ordinal)))
        {
            return "La contraseña necesita al menos 10 caracteres, con mayúsculas, minúsculas y números.";
        }

        return "No se ha podido crear la cuenta. Inténtalo de nuevo.";
    }
}
