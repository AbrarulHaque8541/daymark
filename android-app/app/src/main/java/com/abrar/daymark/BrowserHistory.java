package com.abrar.daymark;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/** Local site history stores only validated HTTP/HTTPS origins; no paths, queries, fragments, userinfo, or titles. */
final class BrowserHistory {
    static final int MAX_ENTRIES = 50;
    private static final int HTTPS_DEFAULT_PORT = 443;
    private static final int HTTP_DEFAULT_PORT = 80;

    private BrowserHistory() { }

    static String sanitizeUrl(String address) {
        if (address == null || address.trim().isEmpty()) return null;
        try {
            URI source = new URI(address.trim());
            String scheme = source.getScheme();
            if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return null;
            String host = source.getHost();
            if (host == null || host.trim().isEmpty()) return null;

            int port = source.getPort();
            if (port == 0 || port > 65535) return null;

            host = host.toLowerCase(Locale.ROOT);
            if (host.indexOf(':') >= 0 && !(host.startsWith("[") && host.endsWith("]"))) {
                host = "[" + host + "]";
            }
            int defaultPort = "https".equalsIgnoreCase(scheme) ? HTTPS_DEFAULT_PORT : HTTP_DEFAULT_PORT;
            int storedPort = port > 0 && port != defaultPort ? port : -1;
            StringBuilder origin = new StringBuilder(scheme.toLowerCase(Locale.ROOT)).append("://").append(host);
            if (storedPort > 0) origin.append(':').append(storedPort);

            URI sanitized = new URI(origin.toString());
            String sanitizedScheme = sanitized.getScheme();
            if (!"https".equalsIgnoreCase(sanitizedScheme) && !"http".equalsIgnoreCase(sanitizedScheme)) return null;
            if (sanitized.getHost() == null
                    || sanitized.getRawUserInfo() != null
                    || sanitized.getPort() != storedPort
                    || (sanitized.getRawPath() != null && !sanitized.getRawPath().isEmpty())
                    || sanitized.getRawQuery() != null
                    || sanitized.getRawFragment() != null) return null;
            return sanitized.toASCIIString();
        } catch (Exception invalidUrl) {
            return null;
        }
    }

    static List<String> decode(String serialized) {
        LinkedHashSet<String> origins = new LinkedHashSet<>();
        if (serialized != null && !serialized.isEmpty()) {
            for (String line : serialized.split("\\n")) {
                if (line.isEmpty()) continue;
                try {
                    String address = new String(Base64.getUrlDecoder().decode(line), StandardCharsets.UTF_8);
                    String origin = sanitizeUrl(address);
                    if (origin != null) origins.add(origin);
                } catch (IllegalArgumentException ignored) {
                    // Ignore invalid local history instead of failing browser startup.
                }
            }
        }
        List<String> result = new ArrayList<>();
        for (String origin : origins) {
            if (result.size() == MAX_ENTRIES) break;
            result.add(origin);
        }
        return result;
    }

    static String add(String serialized, String address) {
        String origin = sanitizeUrl(address);
        if (origin == null) {
            throw new IllegalArgumentException("Only valid HTTP/HTTPS origins can be saved in site history.");
        }
        List<String> entries = decode(serialized);
        entries.remove(origin);
        entries.add(0, origin);
        return encode(entries);
    }

    static String encode(List<String> addresses) {
        LinkedHashSet<String> origins = new LinkedHashSet<>();
        if (addresses != null) {
            for (String address : addresses) {
                String origin = sanitizeUrl(address);
                if (origin != null) origins.add(origin);
                if (origins.size() == MAX_ENTRIES) break;
            }
        }
        StringBuilder encoded = new StringBuilder();
        int index = 0;
        for (String origin : origins) {
            if (index++ > 0) encoded.append('\n');
            encoded.append(Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(origin.getBytes(StandardCharsets.UTF_8)));
        }
        return encoded.toString();
    }

    static String sanitizeSerialized(String serialized) {
        return encode(decode(serialized));
    }

    static String clear() {
        return "";
    }

    /** Case-insensitive substring match over saved origins; a blank query keeps every entry. */
    static List<String> filter(List<String> entries, String query) {
        List<String> result = new ArrayList<>();
        if (entries == null) return result;
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        for (String entry : entries) {
            if (entry == null) continue;
            if (needle.isEmpty() || entry.toLowerCase(Locale.ROOT).contains(needle)) {
                result.add(entry);
            }
        }
        return result;
    }

    /** Removes exactly one saved origin, leaving every other entry in order. */
    static String remove(String serialized, String address) {
        String origin = sanitizeUrl(address);
        List<String> entries = decode(serialized);
        if (origin != null) entries.remove(origin);
        return encode(entries);
    }
}
