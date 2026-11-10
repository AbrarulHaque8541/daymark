package com.abrar.daymark;
import java.net.URI;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Strict parser for Android intent:// browser links.
 *
 * <p>Never accepts component names, selectors, arbitrary extras, launch flags, file/content
 * targets or non-browsable actions. The Android adapter creates a fresh ACTION_VIEW intent from
 * the validated URI; untrusted Intent objects are never launched directly.
 */
final class BrowserIntentLinkPolicy {
    private static final int MAX_INPUT_LENGTH = 2048;
    private static final Pattern SCHEME = Pattern.compile("[A-Za-z][A-Za-z0-9+.-]{0,63}");
    private static final Pattern PACKAGE = Pattern.compile(
            "[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+");

    static final class Decision {
        final String targetUri;
        final String packageName;
        final String fallbackUrl;

        private Decision(String targetUri, String packageName, String fallbackUrl) {
            this.targetUri = targetUri;
            this.packageName = packageName;
            this.fallbackUrl = fallbackUrl;
        }
    }

    private BrowserIntentLinkPolicy() { }

    /**
     * Percent-decode Android Intent URI metadata.
     * Intent metadata uses percent-encoding, not HTML form encoding, so a literal '+' must be preserved.
     */
    private static int asciiHexValue(char value) {
        if (value >= '0' && value <= '9') return value - '0';
        if (value >= 'A' && value <= 'F') return value - 'A' + 10;
        if (value >= 'a' && value <= 'f') return value - 'a' + 10;
        return -1;
    }

    private static String decodeIntentMetadata(String raw) {
        if (raw == null) return "";
        StringBuilder decoded = new StringBuilder(raw.length());
        for (int index = 0; index < raw.length();) {
            if (raw.charAt(index) != '%') {
                // A literal '+' is data in an Intent URI, not form-encoded whitespace.
                decoded.append(raw.charAt(index++));
                continue;
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            while (index < raw.length() && raw.charAt(index) == '%') {
                if (index + 2 >= raw.length()) {
                    throw new IllegalArgumentException("Android app link metadata encoding is invalid.");
                }
                int high = asciiHexValue(raw.charAt(index + 1));
                int low = asciiHexValue(raw.charAt(index + 2));
                if (high < 0 || low < 0) {
                    throw new IllegalArgumentException("Android app link metadata encoding is invalid.");
                }
                bytes.write((high << 4) | low);
                index += 3;
            }
            try {
                String chunk = StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
                decoded.append(chunk);
            } catch (CharacterCodingException invalidUtf8) {
                throw new IllegalArgumentException(
                        "Android app link metadata encoding is invalid.", invalidUtf8);
            }
        }
        return decoded.toString();
    }

    static Decision parse(String value) {
        if (value == null || value.length() > MAX_INPUT_LENGTH || !value.startsWith("intent://")) {
            throw new IllegalArgumentException("Invalid Android app link.");
        }
        int marker = value.indexOf("#Intent;");
        if (marker < 0 || !value.endsWith(";end") || value.indexOf('#', marker + 1) >= 0) {
            throw new IllegalArgumentException("Android app link metadata is incomplete.");
        }

        String base = value.substring(0, marker);
        String metadata = value.substring(marker + "#Intent;".length(), value.length() - ";end".length());
        URI baseUri;
        try {
            baseUri = new URI(base);
        } catch (Exception invalid) {
            throw new IllegalArgumentException("Android app link address is invalid.", invalid);
        }
        if (!"intent".equalsIgnoreCase(baseUri.getScheme()) || baseUri.getHost() == null
                || baseUri.getRawUserInfo() != null || baseUri.getRawFragment() != null
                || baseUri.getPort() == 0 || baseUri.getPort() > 65535
                || hasExplicitEmptyPort(baseUri)) {
            throw new IllegalArgumentException("Android app link address is invalid.");
        }

        Map<String, String> values = new HashMap<>();
        if (!metadata.isEmpty()) {
            String[] fields = metadata.split(";", -1);
            for (String field : fields) {
                if (field.isEmpty()) throw new IllegalArgumentException("Android app link contains an empty field.");
                int equals = field.indexOf('=');
                if (equals <= 0) throw new IllegalArgumentException("Android app link contains an invalid field.");
                String key = field.substring(0, equals);
                String raw = field.substring(equals + 1);
                if (!("scheme".equals(key) || "package".equals(key) || "action".equals(key)
                        || "category".equals(key) || "S.browser_fallback_url".equals(key))) {
                    throw new IllegalArgumentException("Android app link requests an unsupported Intent capability.");
                }
                if (values.containsKey(key)) throw new IllegalArgumentException("Android app link contains duplicate metadata.");
                values.put(key, decodeIntentMetadata(raw));
            }
        }

        String scheme = values.get("scheme");
        if (scheme == null || !SCHEME.matcher(scheme).matches()) {
            throw new IllegalArgumentException("Android app link has no valid target scheme.");
        }
        scheme = scheme.toLowerCase(Locale.ROOT);
        if ("intent".equals(scheme) || "javascript".equals(scheme) || "vbscript".equals(scheme)
                || "file".equals(scheme) || "content".equals(scheme) || "data".equals(scheme)
                || "blob".equals(scheme) || "about".equals(scheme)) {
            throw new IllegalArgumentException("Android app link target scheme is not allowed.");
        }

        String action = values.get("action");
        if (action != null && !"android.intent.action.VIEW".equals(action)) {
            throw new IllegalArgumentException("Only ordinary view links can be opened.");
        }
        String category = values.get("category");
        if (category != null && !"android.intent.category.BROWSABLE".equals(category)) {
            throw new IllegalArgumentException("Only browsable app links can be opened.");
        }

        String packageName = values.get("package");
        if (packageName != null && !PACKAGE.matcher(packageName).matches()) {
            throw new IllegalArgumentException("Android app link package name is invalid.");
        }

        String target = scheme + ":" + base.substring("intent:".length());
        URI targetUri;
        try {
            targetUri = new URI(target);
        } catch (Exception invalid) {
            throw new IllegalArgumentException("Android app link target is invalid.", invalid);
        }
        if (targetUri.getScheme() == null || targetUri.getHost() == null
                || targetUri.getRawUserInfo() != null || targetUri.getRawFragment() != null
                || targetUri.getPort() == 0 || targetUri.getPort() > 65535
                || hasExplicitEmptyPort(targetUri)) {
            throw new IllegalArgumentException("Android app link target is invalid.");
        }

        String normalizedTarget = targetUri.toASCIIString();
        // HTTP(S) targets share the browser navigation contract (ports, credentials, host).
        if ("http".equals(scheme) || "https".equals(scheme)) {
            try {
                normalizedTarget = BrowserAddress.requireAllowedWebUrl(normalizedTarget);
            } catch (IllegalArgumentException invalid) {
                throw new IllegalArgumentException(
                        "Android app link HTTP or HTTPS target must be a valid web address.", invalid);
            }
        }

        String fallback = values.get("S.browser_fallback_url");
        if (fallback != null) {
            try {
                // Share the browser's full URL validation contract: HTTP(S), a real host,
                // no embedded credentials, and no empty/out-of-range explicit port.
                fallback = BrowserAddress.requireAllowedWebUrl(fallback);
            } catch (IllegalArgumentException invalid) {
                throw new IllegalArgumentException(
                        "Android app link fallback must be a valid HTTP or HTTPS web address.", invalid);
            }
        }
        return new Decision(normalizedTarget, packageName, fallback);
    }
    private static boolean hasExplicitEmptyPort(URI uri) {
        String authority = uri.getRawAuthority();
        if (authority == null) return false;
        int userInfoEnd = authority.lastIndexOf('@');
        if (userInfoEnd >= 0) authority = authority.substring(userInfoEnd + 1);
        if (authority.startsWith("[")) {
            int closingBracket = authority.indexOf(']');
            return closingBracket >= 0 && closingBracket + 1 < authority.length()
                    && authority.charAt(closingBracket + 1) == ':'
                    && closingBracket + 2 == authority.length();
        }
        int colon = authority.lastIndexOf(':');
        return colon >= 0 && colon == authority.length() - 1;
    }

}
