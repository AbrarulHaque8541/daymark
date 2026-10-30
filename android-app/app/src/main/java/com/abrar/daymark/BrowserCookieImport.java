package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Strict, UI-independent parser for an explicitly user-selected Netscape cookies.txt export.
 *
 * <p>This parser never discovers installed browsers or reads another app's private storage.
 * Netscape exports cannot represent every modern cookie attribute, including SameSite metadata.
 */
final class BrowserCookieImport {
    static final int MAX_FILE_CHARS = 2 * 1024 * 1024;
    static final int MAX_COOKIES = 10_000;
    static final int MAX_LINE_CHARS = 32 * 1024;
    static final int MAX_VALUE_CHARS = 16 * 1024;
    static final int MAX_LINES = 20_000;
    static final int MAX_REJECTED_LINES_RETAINED = 500;
    static final long MAX_EXPIRY_EPOCH_SECONDS = 253402300799L; // 9999-12-31T23:59:59Z

    enum Rejection {
        MALFORMED_FIELDS,
        INVALID_DOMAIN,
        INVALID_DOMAIN_FLAG,
        INVALID_PATH,
        INVALID_SECURE_FLAG,
        INVALID_EXPIRY,
        INVALID_NAME,
        INVALID_VALUE,
        VALUE_TOO_LARGE,
        LINE_TOO_LARGE,
        TOO_MANY_COOKIES,
        TOO_MANY_LINES
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
        final int rejectedLineCount;
        final boolean rejectionListTruncated;
        final boolean recognizedFormat;

        ParseResult(List<Cookie> cookies, RejectionAccumulator rejected, boolean recognizedFormat) {
            this.cookies = Collections.unmodifiableList(new ArrayList<>(cookies));
            this.rejectedLines = Collections.unmodifiableList(new ArrayList<>(rejected.lines));
            this.rejectedLineCount = rejected.count;
            this.rejectionListTruncated = rejected.truncated;
            this.recognizedFormat = recognizedFormat;
        }

        boolean isEmpty() {
            return cookies.isEmpty();
        }
    }

    private static final class RejectionAccumulator {
        final List<RejectedLine> lines = new ArrayList<>();
        int count;
        boolean truncated;

        void add(int lineNumber, Rejection reason) {
            count++;
            if (lines.size() < MAX_REJECTED_LINES_RETAINED) {
                lines.add(new RejectedLine(lineNumber, reason));
            } else {
                truncated = true;
            }
        }
    }

    private BrowserCookieImport() { }

    static ParseResult parse(String input) {
        List<Cookie> cookies = new ArrayList<>();
        RejectionAccumulator rejected = new RejectionAccumulator();
        if (input == null || input.length() > MAX_FILE_CHARS) {
            rejected.add(1, Rejection.MALFORMED_FIELDS);
            return new ParseResult(cookies, rejected, false);
        }

        boolean recognized = false;
        int offset = 0;
        int lineNumber = 1;
        while (offset <= input.length()) {
            if (lineNumber > MAX_LINES) {
                rejected.add(lineNumber, Rejection.TOO_MANY_LINES);
                break;
            }

            int newline = input.indexOf('\n', offset);
            int end = newline >= 0 ? newline : input.length();
            if (end > offset && input.charAt(end - 1) == '\r') end--;
            String line = input.substring(offset, end);

            if (line.length() > MAX_LINE_CHARS) {
                rejected.add(lineNumber, Rejection.LINE_TOO_LARGE);
            } else if (!line.isEmpty()) {
                if (line.startsWith("# Netscape HTTP Cookie File")
                        || line.startsWith("# HTTP Cookie File")) {
                    recognized = true;
                } else {
                    boolean httpOnly = line.startsWith("#HttpOnly_");
                    if (httpOnly) {
                        recognized = true;
                        line = line.substring("#HttpOnly_".length());
                    } else if (line.startsWith("#")) {
                        // Ordinary Netscape comments are not cookie rows.
                        line = null;
                    }

                    if (line != null) {
                        String[] fields = line.split("\\t", -1);
                        if (fields.length != 7) {
                            rejected.add(lineNumber, Rejection.MALFORMED_FIELDS);
                        } else {
                            String rawDomain = fields[0].toLowerCase(Locale.ROOT);
                            boolean leadingDot = rawDomain.startsWith(".");
                            String domain = leadingDot ? rawDomain.substring(1) : rawDomain;
                            if (!isValidDomain(domain)) {
                                rejected.add(lineNumber, Rejection.INVALID_DOMAIN);
                            } else if (!"TRUE".equalsIgnoreCase(fields[1])
                                    && !"FALSE".equalsIgnoreCase(fields[1])) {
                                rejected.add(lineNumber, Rejection.INVALID_DOMAIN_FLAG);
                            } else if (leadingDot != "TRUE".equalsIgnoreCase(fields[1])) {
                                // Netscape's leading-dot and include-subdomains flag must agree.
                                rejected.add(lineNumber, Rejection.INVALID_DOMAIN_FLAG);
                            } else {
                                String path = fields[2];
                                if (!isValidPath(path)) {
                                    rejected.add(lineNumber, Rejection.INVALID_PATH);
                                } else if (!"TRUE".equalsIgnoreCase(fields[3])
                                        && !"FALSE".equalsIgnoreCase(fields[3])) {
                                    rejected.add(lineNumber, Rejection.INVALID_SECURE_FLAG);
                                } else {
                                    long expiry;
                                    try {
                                        expiry = Long.parseLong(fields[4]);
                                        if (expiry < 0L || expiry > MAX_EXPIRY_EPOCH_SECONDS) {
                                            throw new NumberFormatException("expiry out of range");
                                        }
                                    } catch (NumberFormatException invalidExpiry) {
                                        rejected.add(lineNumber, Rejection.INVALID_EXPIRY);
                                        expiry = -1L;
                                    }

                                    if (expiry >= 0L) {
                                        String name = fields[5];
                                        if (!isValidName(name)) {
                                            rejected.add(lineNumber, Rejection.INVALID_NAME);
                                        } else {
                                            String value = fields[6];
                                            if (value.length() > MAX_VALUE_CHARS) {
                                                rejected.add(lineNumber, Rejection.VALUE_TOO_LARGE);
                                            } else if (!isValidValue(value)) {
                                                rejected.add(lineNumber, Rejection.INVALID_VALUE);
                                            } else if (cookies.size() >= MAX_COOKIES) {
                                                rejected.add(lineNumber, Rejection.TOO_MANY_COOKIES);
                                                break;
                                            } else {
                                                cookies.add(new Cookie(domain,
                                                        "TRUE".equalsIgnoreCase(fields[1]), path,
                                                        "TRUE".equalsIgnoreCase(fields[3]), expiry,
                                                        name, value, httpOnly));
                                                // Headerless Netscape exports are valid too.
                                                recognized = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (newline < 0) break;
            offset = newline + 1;
            lineNumber++;
        }
        return new ParseResult(cookies, rejected, recognized);
    }

    static boolean isValidDomain(String domain) {
        if (domain.isEmpty() || domain.length() > 253 || domain.startsWith(".")
                || domain.endsWith(".") || domain.contains("..")) return false;
        String[] labels = domain.split("\\.", -1);
        for (String label : labels) {
            if (label.isEmpty() || label.length() > 63 || label.charAt(0) == '-'
                    || label.charAt(label.length() - 1) == '-') return false;
            for (int i = 0; i < label.length(); i++) {
                char c = label.charAt(i);
                if (!(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '-') {
                    return false;
                }
            }
        }
        return true;
    }

    static boolean isValidName(String name) {
        if (name.isEmpty() || name.length() > 256) return false;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            boolean alphaNumeric = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9');
            boolean tokenPunctuation = "!#$%&'*+-.^_`|~".indexOf(c) >= 0;
            if (!alphaNumeric && !tokenPunctuation) return false;
        }
        return true;
    }

    static boolean isValidValue(String value) {
        // RFC 6265 cookie-octet: printable ASCII except DQUOTE, comma, semicolon and backslash.
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 0x21 || c > 0x7e || c == '"' || c == ',' || c == ';' || c == '\\') {
                return false;
            }
        }
        return true;
    }

    static boolean isValidPath(String path) {
        return path != null && !path.isEmpty() && path.charAt(0) == '/'
                && path.indexOf(';') < 0 && !containsControl(path);
    }

    private static boolean containsControl(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 0x20 || c == 0x7f) return true;
        }
        return false;
    }
}
