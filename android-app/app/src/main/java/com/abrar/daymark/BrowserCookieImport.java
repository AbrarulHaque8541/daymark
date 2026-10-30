package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Strict, UI-independent parser for the Netscape cookies.txt interchange format.
 *
 * <p>This parses only a file explicitly selected by the user. It does not inspect another
 * browser's private storage, discover installed apps, or import cookies by itself. Netscape
 * exports cannot represent every modern cookie attribute (notably SameSite metadata).
 */
final class BrowserCookieImport {
    static final int MAX_FILE_CHARS = 2 * 1024 * 1024;
    static final int MAX_COOKIES = 10_000;
    static final int MAX_LINE_CHARS = 32 * 1024;
    static final int MAX_VALUE_CHARS = 16 * 1024;

    enum Rejection {
        MALFORMED_FIELDS,
        INVALID_DOMAIN,
        INVALID_DOMAIN_FLAG,
        INVALID_PATH,
        INVALID_SECURE_FLAG,
        INVALID_EXPIRY,
        INVALID_NAME,
        VALUE_TOO_LARGE,
        LINE_TOO_LARGE,
        TOO_MANY_COOKIES
    }

    static final class Cookie {
        final String domain;
        final boolean includeSubdomains;
        final String path;
        final boolean secure;
        final long expiresAtEpochSeconds;
        final String name;
        final String value;
        final boolean httpOnly;

        Cookie(String domain, boolean includeSubdomains, String path, boolean secure,
               long expiresAtEpochSeconds, String name, String value, boolean httpOnly) {
            this.domain = domain;
            this.includeSubdomains = includeSubdomains;
            this.path = path;
            this.secure = secure;
            this.expiresAtEpochSeconds = expiresAtEpochSeconds;
            this.name = name;
            this.value = value;
            this.httpOnly = httpOnly;
        }

        boolean isSessionCookie() {
            return expiresAtEpochSeconds == 0L;
        }

        boolean isExpired(long nowEpochSeconds) {
            return !isSessionCookie() && expiresAtEpochSeconds <= nowEpochSeconds;
        }
    }

    static final class RejectedLine {
        final int lineNumber;
        final Rejection reason;

        RejectedLine(int lineNumber, Rejection reason) {
            this.lineNumber = lineNumber;
            this.reason = reason;
        }
    }

    static final class ParseResult {
        final List<Cookie> cookies;
        final List<RejectedLine> rejectedLines;
        final boolean recognizedFormat;

        ParseResult(List<Cookie> cookies, List<RejectedLine> rejectedLines,
                    boolean recognizedFormat) {
            this.cookies = Collections.unmodifiableList(new ArrayList<>(cookies));
            this.rejectedLines = Collections.unmodifiableList(new ArrayList<>(rejectedLines));
            this.recognizedFormat = recognizedFormat;
        }

        boolean isEmpty() {
            return cookies.isEmpty();
        }
    }

    private BrowserCookieImport() { }

    static ParseResult parse(String input) {
        List<Cookie> cookies = new ArrayList<>();
        List<RejectedLine> rejected = new ArrayList<>();
        if (input == null || input.length() > MAX_FILE_CHARS) {
            rejected.add(new RejectedLine(1, Rejection.MALFORMED_FIELDS));
            return new ParseResult(cookies, rejected, false);
        }

        boolean recognized = false;
        String[] lines = input.split("\\r?\\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            if (line.length() > MAX_LINE_CHARS) {
                rejected.add(new RejectedLine(i + 1, Rejection.LINE_TOO_LARGE));
                continue;
            }
            if (line.isEmpty()) continue;
            if (line.startsWith("# Netscape HTTP Cookie File")
                    || line.startsWith("# HTTP Cookie File")) {
                recognized = true;
                continue;
            }
            boolean httpOnly = line.startsWith("#HttpOnly_");
            if (httpOnly) {
                recognized = true;
                line = line.substring("#HttpOnly_".length());
            } else if (line.startsWith("#")) {
                continue;
            }

            String[] fields = line.split("\\t", -1);
            if (fields.length != 7) {
                rejected.add(new RejectedLine(i + 1, Rejection.MALFORMED_FIELDS));
                continue;
            }

            String domain = fields[0].trim().toLowerCase(Locale.ROOT);
            if (domain.startsWith(".")) domain = domain.substring(1);
            if (!isValidDomain(domain)) {
                rejected.add(new RejectedLine(i + 1, Rejection.INVALID_DOMAIN));
                continue;
            }
            if (!"TRUE".equalsIgnoreCase(fields[1]) && !"FALSE".equalsIgnoreCase(fields[1])) {
                rejected.add(new RejectedLine(i + 1, Rejection.INVALID_DOMAIN_FLAG));
                continue;
            }
            String path = fields[2];
            if (path.isEmpty() || path.charAt(0) != '/' || containsControl(path)) {
                rejected.add(new RejectedLine(i + 1, Rejection.INVALID_PATH));
                continue;
            }
            if (!"TRUE".equalsIgnoreCase(fields[3]) && !"FALSE".equalsIgnoreCase(fields[3])) {
                rejected.add(new RejectedLine(i + 1, Rejection.INVALID_SECURE_FLAG));
                continue;
            }
            long expiry;
            try {
                expiry = Long.parseLong(fields[4]);
                if (expiry < 0L) throw new NumberFormatException("negative expiry");
            } catch (NumberFormatException invalidExpiry) {
                rejected.add(new RejectedLine(i + 1, Rejection.INVALID_EXPIRY));
                continue;
            }
            String name = fields[5];
            if (!isValidName(name)) {
                rejected.add(new RejectedLine(i + 1, Rejection.INVALID_NAME));
                continue;
            }
            String value = fields[6];
            if (value.length() > MAX_VALUE_CHARS || containsControl(value)) {
                rejected.add(new RejectedLine(i + 1, Rejection.VALUE_TOO_LARGE));
                continue;
            }
            if (cookies.size() >= MAX_COOKIES) {
                rejected.add(new RejectedLine(i + 1, Rejection.TOO_MANY_COOKIES));
                break;
            }
            cookies.add(new Cookie(domain, "TRUE".equalsIgnoreCase(fields[1]), path,
                    "TRUE".equalsIgnoreCase(fields[3]), expiry, name, value, httpOnly));
        }
        return new ParseResult(cookies, rejected, recognized);
    }

    private static boolean isValidDomain(String domain) {
        if (domain.isEmpty() || domain.length() > 253 || domain.startsWith(".")
                || domain.endsWith(".") || domain.contains("..")) return false;
        for (int i = 0; i < domain.length(); i++) {
            char c = domain.charAt(i);
            if (!(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9')
                    && c != '.' && c != '-') return false;
            if (c == '-' && (i == 0 || domain.charAt(i - 1) == '.'
                    || i == domain.length() - 1 || domain.charAt(i + 1) == '.')) return false;
        }
        return true;
    }

    private static boolean isValidName(String name) {
        if (name.isEmpty() || name.length() > 256) return false;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c <= 0x20 || c >= 0x7f || c == ';' || c == ',' || c == '='
                    || c == '\\' || c == '"') return false;
        }
        return true;
    }

    private static boolean containsControl(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 0x20 || c == 0x7f) return true;
        }
        return false;
    }
}
