using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;

namespace Viajes.Api.Auth;

/// <summary>
/// Órdenes de mantenimiento que se lanzan desde la consola del servidor (railway ssh), nunca por la web:
///   dotnet Viajes.Api.dll reset-password persona@example.com
/// Genera una contraseña temporal, la escribe en la consola, desbloquea la cuenta y cierra todas sus sesiones.
/// </summary>
public static class AdminCommands
{
    public static bool IsCommand(string[] args) => args.Length > 0 && args[0] == "reset-password";

    public static async Task<int> RunAsync(IServiceProvider services, string[] args, TextWriter? output = null)
    {
        var console = output ?? Console.Out;
        if (args.Length != 2)
        {
            Console.Error.WriteLine("Uso: dotnet Viajes.Api.dll reset-password persona@example.com");
            return 2;
        }

        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
        var user = await users.FindByEmailAsync(args[1]);
        if (user is null)
        {
            Console.Error.WriteLine("No existe ninguna cuenta con ese correo.");
            return 1;
        }

        var password = NewPassword();
        // Sin proveedores de tokens (no hay correo saliente): se quita la contraseña y se pone la nueva directamente.
        await users.RemovePasswordAsync(user);
        var result = await users.AddPasswordAsync(user, password);
        if (!result.Succeeded)
        {
            Console.Error.WriteLine("No se ha podido cambiar: " + string.Join(" ", result.Errors.Select(e => e.Description)));
            return 1;
        }

        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        await users.UpdateSecurityStampAsync(user);
        console.WriteLine($"Contraseña temporal de {user.Email}: {password}");
        console.WriteLine("Todas sus sesiones se han cerrado. Cámbiala al entrar (Ajustes → Cuenta).");
        return 0;
    }

    /// <summary>16 caracteres sin ambiguos (0/O, 1/l): fácil de teclear en el móvil.</summary>
    public static string NewPassword()
    {
        const string alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return string.Create(16, 0, (span, _) =>
        {
            for (var i = 0; i < span.Length; i++)
            {
                span[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
            }
        });
    }
}
