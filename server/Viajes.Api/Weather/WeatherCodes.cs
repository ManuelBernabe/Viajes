namespace Viajes.Api.Weather;

/// <summary>Los códigos WMO del tiempo en un icono y una palabra (para los avisos, que van en español).</summary>
public static class WeatherCodes
{
    public static (string Icon, string Label) Describe(int code) => code switch
    {
        0 => ("☀️", "despejado"),
        1 => ("🌤️", "casi despejado"),
        2 => ("⛅", "nubes y claros"),
        3 => ("☁️", "nublado"),
        45 or 48 => ("🌫️", "niebla"),
        51 or 53 or 55 or 56 or 57 => ("🌦️", "llovizna"),
        61 or 63 or 66 or 80 or 81 => ("🌧️", "lluvia"),
        65 or 67 or 82 => ("🌧️", "lluvia fuerte"),
        71 or 73 or 75 or 77 or 85 or 86 => ("🌨️", "nieve"),
        95 or 96 or 99 => ("⛈️", "tormenta"),
        _ => ("🌡️", "tiempo variable"),
    };

    /// <summary>«☀️ 24° / 15° en Buenos Aires · lluvia 10 %».</summary>
    public static string Line(DayWeather day)
    {
        var (icon, label) = Describe(day.Code ?? -1);
        var temps = day.Max is not null && day.Min is not null ? $" {Math.Round(day.Max.Value)}° / {Math.Round(day.Min.Value)}°" : "";
        var rain = day.Rain is >= 30 ? $" · lluvia {day.Rain} %" : "";
        return $"{icon} {char.ToUpperInvariant(label[0])}{label[1..]},{temps} en {day.Place}{rain}";
    }
}
