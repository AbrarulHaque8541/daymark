package com.abrar.daymark;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * Sanitizes untrusted HTTP Content-Disposition / URL-derived names before passing
 * them to Android DownloadManager destinations.
 *
 * <p>Removes path traversal, control/log-injection and bidi-override characters,
 * normalizes Unicode, and bounds the UTF-8 filename length for common filesystems.
 */
final class BrowserDownloadFilenamePolicy {
    private static final int MAX_UTF8_BYTES = 180;
    private static final Pattern WINDOWS_RESERVED_BASE = Pattern.compile(
            "(?i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$");

    private BrowserDownloadFilenamePolicy() { }

    static String sanitize(String suggested) {
        String input = Normalizer.normalize(suggested == null ? "" : suggested,
                Normalizer.Form.NFC);
        StringBuilder safe = new StringBuilder();
        int byteCount = 0;
        for (int offset = 0; offset < input.length();) {
            int codePoint = input.codePointAt(offset);
            offset += Character.charCount(codePoint);

            if (isUnsafeControl(codePoint)) continue;
            if (isFilenameForbidden(codePoint)) codePoint = '_';
            if (safe.length() == 0 && codePoint == '.') continue;

            int encodedBytes = utf8Length(codePoint);
            if (byteCount + encodedBytes > MAX_UTF8_BYTES) break;
            safe.appendCodePoint(codePoint);
            byteCount += encodedBytes;
        }

        String result = safe.toString().trim();
        while (result.endsWith(".") || result.endsWith(" ")) {
            result = result.substring(0, result.length() - 1);
        }
        if (result.isEmpty() || ".".equals(result) || "..".equals(result)) {
            return "download";
        }

        int extension = result.indexOf('.');
        String base = extension < 0 ? result : result.substring(0, extension);
        if (WINDOWS_RESERVED_BASE.matcher(base).matches()) result = "_" + result;
        return result;
    }

    private static boolean isFilenameForbidden(int codePoint) {
        switch (codePoint) {
            case '/': case '\\': case ':': case '*': case '?':
            case '"': case '<': case '>': case '|':
                return true;
            default:
                return false;
        }
    }

    private static boolean isUnsafeControl(int codePoint) {
        if (Character.isISOControl(codePoint)) return true;
        // Unicode directional controls can visually reorder a filename's extension.
        return codePoint == 0x061C || codePoint == 0x200E || codePoint == 0x200F
                || (codePoint >= 0x202A && codePoint <= 0x202E)
                || (codePoint >= 0x2066 && codePoint <= 0x2069)
                || codePoint == 0xFEFF;
    }

    private static int utf8Length(int codePoint) {
        if (codePoint <= 0x7F) return 1;
        if (codePoint <= 0x7FF) return 2;
        if (codePoint <= 0xFFFF) return 3;
        return 4;
    }
}
