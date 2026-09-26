using WebPush;
using Viajes.Api.Push;

namespace Viajes.Tests;

public sealed class WebPushSenderTests
{
    [Fact]
    public void The_request_options_are_accepted_by_the_library_and_carry_the_urgency_header()
    {
        var keys = VapidHelper.GenerateVapidKeys();
        var client = new WebPushClient();
        client.SetVapidDetails("mailto:prueba@example.com", keys.PublicKey, keys.PrivateKey);
        var subscription = new PushSubscription("https://push.example/dispositivo", "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "tBHItJI5svbpez7KI4CCXg");

        var request = client.GenerateRequestDetails(subscription, "{\"title\":\"Viajes\"}", WebPushSender.Options());

        Assert.Equal("high", request.Headers.GetValues("Urgency").Single());
        Assert.Equal("21600", request.Headers.GetValues("TTL").Single());
    }
}
