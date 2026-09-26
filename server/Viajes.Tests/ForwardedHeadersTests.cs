using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;

namespace Viajes.Tests;

// Reproduce Railway: el proxy termina el TLS y reenvía en http con X-Forwarded-Proto y X-Forwarded-For.
public sealed class ProxiedApp : TestApp
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("FORWARDEDHEADERS_ENABLED", "true");
    }
}

public sealed class ForwardedHeadersTests(ProxiedApp app) : IClassFixture<ProxiedApp>
{
    [Fact]
    public async Task A_https_origin_behind_the_proxy_is_accepted()
    {
        var response = await app.CreateClient().SendAsync(Login(forwardedProto: "https"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Without_the_forwarded_scheme_the_https_origin_is_rejected()
    {
        var response = await app.CreateClient().SendAsync(Login(forwardedProto: null));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task The_client_ip_comes_from_the_proxy_header()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/diag/network");
        request.Headers.Add("X-Forwarded-Proto", "https");
        request.Headers.Add("X-Forwarded-For", "203.0.113.7");

        var network = await (await app.CreateClient().SendAsync(request)).Content.ReadFromJsonAsync<NetworkInfo>();

        Assert.Equal("https", network!.Scheme);
        Assert.Equal("203.0.113.7", network.RemoteIp);
    }

    private static HttpRequestMessage Login(string? forwardedProto)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "x@example.com", password = "x" }),
        };
        request.Headers.Add("Origin", "https://localhost");
        if (forwardedProto is not null)
        {
            request.Headers.Add("X-Forwarded-Proto", forwardedProto);
        }

        return request;
    }

    private sealed record NetworkInfo(string Scheme, string? RemoteIp, string? ForwardedFor);
}
