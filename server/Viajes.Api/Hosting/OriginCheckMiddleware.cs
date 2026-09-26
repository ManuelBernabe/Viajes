namespace Viajes.Api.Hosting;

public sealed class OriginCheckMiddleware(RequestDelegate next)
{
    public const string RejectionType = "origin_rejected";

    public async Task InvokeAsync(HttpContext context)
    {
        var method = context.Request.Method;
        var isWrite = !(HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method));

        if (isWrite && context.Request.Headers.Origin is { Count: > 0 } origin)
        {
            var expected = $"{context.Request.Scheme}://{context.Request.Host}";
            if (!string.Equals(origin.ToString(), expected, StringComparison.OrdinalIgnoreCase))
            {
                // Tipo propio: el cliente no debe confundirlo con un rechazo de permisos y descartar su cola.
                await Results.Problem(
                    "La petición no viene de la propia app.",
                    statusCode: StatusCodes.Status403Forbidden,
                    type: RejectionType).ExecuteAsync(context);
                return;
            }
        }

        await next(context);
    }
}
