using System.Text.RegularExpressions;
using MimeKit;

namespace Viajes.Api.Inbox;

public static partial class EmailParser
{
    private static readonly HashSet<string> KeptMimes =
        ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "application/vnd.apple.pkpass"];

    public static ParsedEmail Parse(Stream raw)
    {
        var message = MimeMessage.Load(raw);
        var suggestion = JsonLdReservations.Extract(message.HtmlBody) ?? new Suggestion();
        var attachments = new List<ParsedAttachment>();

        foreach (var part in message.BodyParts.OfType<MimePart>())
        {
            var name = part.FileName;
            var mime = part.ContentType.MimeType.ToLowerInvariant();
            if (name is not null && name.EndsWith(".pkpass", StringComparison.OrdinalIgnoreCase))
            {
                mime = "application/vnd.apple.pkpass";
            }

            if (!KeptMimes.Contains(mime) || (!part.IsAttachment && name is null))
            {
                continue;
            }

            var bytes = Bytes(part);
            string? qrText = null;
            if (mime == "application/vnd.apple.pkpass")
            {
                var pass = PkPass.Read(bytes);
                if (pass is not null)
                {
                    qrText = pass.BarcodeMessage;
                    suggestion.FillFrom(pass.Suggestion);
                }
            }

            attachments.Add(new ParsedAttachment(name ?? $"adjunto-{attachments.Count + 1}", mime, bytes, qrText));
        }

        if (suggestion.Title is null)
        {
            var subject = CleanSubject(message.Subject);
            suggestion.Title = subject.Length == 0 ? null : subject;
        }

        var from = message.From.Mailboxes.FirstOrDefault()?.Address ?? message.Sender?.Address ?? "";
        return new ParsedEmail
        {
            MessageId = string.IsNullOrWhiteSpace(message.MessageId) ? $"sin-id-{Fingerprint(message)}" : message.MessageId,
            From = from,
            Subject = message.Subject ?? "",
            ReceivedMs = (message.Date == default ? DateTimeOffset.UtcNow : message.Date).ToUnixTimeMilliseconds(),
            BodyText = BodyText(message),
            GmailAuth = GmailAuthentication(message),
            Suggestion = suggestion,
            Attachments = attachments,
        };
    }

    /// <summary>
    /// Gmail añade «Authentication-Results: mx.google.com; dkim=pass …» (o su variante ARC) a lo que recibe de fuera.
    /// Sin DKIM ni SPF válidos, no entra. Un correo enviado desde la propia cuenta de Gmail no lleva esta cabecera:
    /// ese caso lo decide el punto de importación comparando el remitente con el dueño del token.
    /// </summary>
    public static bool GmailAuthenticated(MimeMessage message) => GmailAuthentication(message) == GmailAuth.Pass;

    /// <summary>Pass si Gmail validó DKIM o SPF; Fail si lo comprobó y falló; None si no hay cabecera de Gmail (correo interno).</summary>
    public static GmailAuth GmailAuthentication(MimeMessage message)
    {
        var result = GmailAuth.None;
        foreach (var header in message.Headers.Where(h =>
                     h.Field.Equals("Authentication-Results", StringComparison.OrdinalIgnoreCase)
                     || h.Field.Equals("ARC-Authentication-Results", StringComparison.OrdinalIgnoreCase)))
        {
            var value = header.Value.Replace("\r", " ").Replace("\n", " ").TrimStart();
            // ARC antepone «i=1; ».
            value = ArcPrefix().Replace(value, "");
            if (!value.StartsWith("mx.google.com", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (AuthPass().IsMatch(value))
            {
                return GmailAuth.Pass;
            }

            result = GmailAuth.Fail;
        }

        return result;
    }

    /// <summary>«Fwd: RV: Tu reserva» → «Tu reserva».</summary>
    public static string CleanSubject(string? subject)
    {
        var cleaned = (subject ?? "").Trim();
        while (true)
        {
            var next = ForwardPrefix().Replace(cleaned, "").Trim();
            if (next == cleaned)
            {
                return cleaned;
            }

            cleaned = next;
        }
    }

    /// <summary>Texto plano para consultar en la app. El HTML nunca sale del servidor como HTML.</summary>
    private static string? BodyText(MimeMessage message)
    {
        var text = message.TextBody;
        if (string.IsNullOrWhiteSpace(text) && message.HtmlBody is { } html)
        {
            text = StripHtml(html);
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        text = text.Replace("\r\n", "\n").Trim();
        return text.Length > 20_000 ? text[..20_000] : text;
    }

    internal static string StripHtml(string html)
    {
        var withoutScripts = ScriptsAndStyles().Replace(html, " ");
        var withBreaks = BlockTags().Replace(withoutScripts, "\n");
        var plain = Tags().Replace(withBreaks, " ");
        plain = System.Net.WebUtility.HtmlDecode(plain);
        plain = Spaces().Replace(plain, " ");
        plain = BlankLines().Replace(plain, "\n\n");
        return plain.Trim();
    }

    private static byte[] Bytes(MimePart part)
    {
        using var stream = new MemoryStream();
        part.Content.DecodeTo(stream);
        return stream.ToArray();
    }

    private static string Fingerprint(MimeMessage message) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes($"{message.From}|{message.Subject}|{message.Date:O}")))[..16];

    [GeneratedRegex(@"\b(dkim|spf)=pass\b", RegexOptions.IgnoreCase)]
    private static partial Regex AuthPass();

    [GeneratedRegex(@"^i=\d+;\s*")]
    private static partial Regex ArcPrefix();

    [GeneratedRegex(@"^(fwd?|rv|re|tr|wg|aw)\s*:\s*", RegexOptions.IgnoreCase)]
    private static partial Regex ForwardPrefix();

    [GeneratedRegex(@"<(script|style)[^>]*>.*?</\1>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ScriptsAndStyles();

    [GeneratedRegex(@"<\s*(br|/p|/div|/tr|/li|/h[1-6]|/td)\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex BlockTags();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"[ \t ]+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"\s*\n\s*(\n\s*)+")]
    private static partial Regex BlankLines();
}
