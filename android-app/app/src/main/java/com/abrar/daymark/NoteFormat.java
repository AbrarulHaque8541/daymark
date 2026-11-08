package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Minimal, deterministic formatting for a task note, so a note reads the way it was written.
 *
 * <p>Two constructs are recognised, and nothing else:
 * <ul>
 *   <li><b>Inline code</b> — text between single backticks on one line. The backticks are not
 *       displayed; the content is drawn in the monospace family.</li>
 *   <li><b>HTTP/HTTPS links</b> — explicit {@code http://…} and {@code https://…} runs delimited
 *       by whitespace or sentence-ending punctuation. Valid links become tappable and open in
 *       the in-app browser.</li>
 * </ul>
 *
 * <p>Only explicit HTTP/HTTPS URLs are linkified. Every candidate is validated by
 * {@link BrowserAddress#isAllowedWebUrl(String)}, so malformed hosts, embedded credentials,
 * invalid ports and unsupported schemes stay as plain text. HTML, Markdown emphasis and images
 * are not parsed — a note is untrusted user text, never rendered as markup.
 *
 * <p>Spans are returned sorted by start offset and never overlap: code is recognised first and
 * the scan resumes after it, so a URL inside backticks stays code. Unclosed backticks and
 * over-long URLs stay literal text rather than producing a half-formatted note.
 */
final class NoteFormat {
    enum Kind { CODE, LINK }

    static final class Span {
        final int start;
        final int end;
        final Kind kind;
        /** The URL for a {@link Kind#LINK} span; null for code. */
        final String target;

        Span(int start, int end, Kind kind, String target) {
            this.start = start;
            this.end = end;
            this.kind = kind;
            this.target = target;
        }

        @Override public String toString() {
            return kind + "[" + start + "," + end + ")" + (target == null ? "" : " " + target);
        }
    }

    static final int MAX_LINK_CHARS = 2048;
    private static final char BACKTICK = 0x60;
    private static final char SINGLE_QUOTE = 0x27;

    private NoteFormat() { }

    static List<Span> spans(String text) {
        if (text == null || text.isEmpty()) return Collections.emptyList();
        List<Span> spans = new ArrayList<>();
        int length = text.length();
        int index = 0;
        while (index < length) {
            char current = text.charAt(index);
            if (current == BACKTICK) {
                int close = text.indexOf(BACKTICK, index + 1);
                int lineBreak = close == -1 ? -1 : text.indexOf('\n', index + 1);
                boolean singleLine = close > index + 1 && (lineBreak == -1 || lineBreak > close);
                if (singleLine) {
                    spans.add(new Span(index + 1, close, Kind.CODE, null));
                    index = close + 1;
                    continue;
                }
                index++;
                continue;
            }
            if (isSchemeStart(text, index)) {
                int end = linkEnd(text, index);
                if (end > index) {
                    spans.add(new Span(index, end, Kind.LINK, text.substring(index, end)));
                    index = end;
                    continue;
                }
            }
            index++;
        }
        return spans;
    }

    /** Length of an explicit HTTP or HTTPS scheme at {@code index}, or zero when absent. */
    private static int schemeLengthAt(String text, int index) {
        if (text.regionMatches(true, index, "https://", 0, 8)) return 8;
        if (text.regionMatches(true, index, "http://", 0, 7)) return 7;
        return 0;
    }

    /** True when an explicit HTTP/HTTPS scheme starts at {@code index} as its own token. */
    private static boolean isSchemeStart(String text, int index) {
        if (schemeLengthAt(text, index) == 0) return false;
        if (index == 0) return true;
        char before = text.charAt(index - 1);
        return !Character.isLetterOrDigit(before) && before != '_';
    }

    /** End offset of a valid link beginning at {@code start}, after trailing punctuation is trimmed. */
    private static int linkEnd(String text, int start) {
        int schemeLength = schemeLengthAt(text, start);
        if (schemeLength == 0) return start;
        int end = start + schemeLength;
        while (end < text.length()) {
            char c = text.charAt(end);
            if (Character.isWhitespace(c) || c == '<' || c == '>' || c == '"' || c == SINGLE_QUOTE
                    || c == BACKTICK) break;
            end++;
        }
        if (end - start > MAX_LINK_CHARS) return start;
        while (end > start && isTrailingPunctuation(text.charAt(end - 1))) {
            if (text.charAt(end - 1) == ']' && closesIpv6Authority(text, start, end)) break;
            end--;
        }
        return end > start + schemeLength
                && BrowserAddress.isAllowedWebUrl(text.substring(start, end)) ? end : start;
    }

    /** Keeps the closing bracket when it is part of a bracketed IPv6 authority. */
    private static boolean closesIpv6Authority(String text, int start, int end) {
        int authorityStart = start + schemeLengthAt(text, start);
        int authorityEnd = end;
        for (int index = authorityStart; index < authorityEnd; index++) {
            char c = text.charAt(index);
            if (c == '/' || c == '?' || c == '#') {
                authorityEnd = index;
                break;
            }
        }
        return authorityEnd == end && authorityEnd > authorityStart
                && text.charAt(authorityStart) == '[' && text.charAt(authorityEnd - 1) == ']';
    }

    private static boolean isTrailingPunctuation(char c) {
        return c == '.' || c == ',' || c == ';' || c == ':' || c == '!' || c == '?'
                || c == ')' || c == ']' || c == '}' || c == '*';
    }
}
