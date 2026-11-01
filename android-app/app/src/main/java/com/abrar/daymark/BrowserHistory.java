package com.abrar.daymark;

import java.net.IDN;
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
            if (source.isOpaque() || source.getRawAuthority() == null) return null;

            // URI.getHost() is null for valid Unicode IDNs. Parse the raw authority
            // without retaining userinfo, then canonicalize DNS names to ASCII.
            String authority = source.getRawAuthority();
            int userInfoEnd = authority.lastIndexOf('@');
            String hostAndPort = authority.substring(userInfoEnd + 1);
            if (hostAndPort.isEmpty()) return null;

            String host;
            int port = -1;
            if (hostAndPort.startsWith("[")) {
                int closingBracket = hostAndPort.indexOf(']');
                if (closingBracket <= 1) return null;
                host = hostAndPort.substring(0, closingBracket + 1);
                String suffix = hostAndPort.substring(closingBracket + 1);
                if (!suffix.isEmpty()) {
                    if (!suffix.startsWith(":")) return null;
                    port = parsePort(suffix.substring(1));
                }
                URI ipv6 = new URI(scheme.toLowerCase(Locale.ROOT) + "://" + host);
                if (ipv6.getHost() == null) return null;
                host = ipv6.getHost().toLowerCase(Locale.ROOT);
            } else {
                int colon = hostAndPort.lastIndexOf(':');
                if (colon >= 0) {
                    // IPv6 literals must be bracketed; multiple unbracketed colons
                    // are not a valid DNS host/port pair.
                    if (hostAndPort.indexOf(':') != colon) return null;
                    host = hostAndPort.substring(0, colon);
                    port = parsePort(hostAndPort.substring(colon + 1));
                } else {
                    host = hostAndPort;
                }
                if (host.isEmpty()) return null;
                // A single DNS root dot is equivalent; normalize it so duplicate
                // visits to example.test and example.test. share one history entry.
                if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
                if (host.isEmpty() || host.endsWith(".")) return null;
                for (String label : host.split("\\.", -1)) {
                    if (label.isEmpty() || label.length() > 63) return null;
                }
                host = IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
                if (host.isEmpty() || host.length() > 253) return null;
                for (String label : host.split("\\.", -1)) {
                    if (label.isEmpty() || label.length() > 63) return null;
                }
            }

            if (port == 0 || port > 65535) return null;
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

    /** Parses only an explicit decimal port in the valid TCP range. */
    private static int parsePort(String value) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("empty port");
        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) < '0' || value.charAt(i) > '9') {
                throw new IllegalArgumentException("port must be decimal");
            }
        }
        int port = Integer.parseInt(value);
        if (port < 1 || port > 65535) throw new IllegalArgumentException("port out of range");
        return port;
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
