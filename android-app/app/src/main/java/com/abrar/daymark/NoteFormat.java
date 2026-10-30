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
 *   <li><b>Bare HTTPS links</b> — {@code https://…} runs delimited by whitespace or the characters
 *       that end a sentence. They become tappable and open in the in-app browser.</li>
 * </ul>
 *
 * <p>{@code http://} is deliberately not linkified. The browser this app ships is HTTPS-only and
 * would refuse the navigation anyway; offering a link that cannot open would be a worse
 * experience than leaving it as plain text. HTML, Markdown emphasis and images are not parsed —
 * a note is untrusted user text, never rendered as markup.
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

    private NoteFormat() { }

    static List<Span> spans(String text) {
        if (text == null || text.isEmpty()) return Collections.emptyList();
        List<Span> spans = new ArrayList<>();
        int length = text.length();
        int index = 0;
        while (index < length) {
            char current = text.charAt(index);
            if (current == '`') {
                int close = text.indexOf('`', index + 1);
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
                if (end > index + 8) {
                    spans.add(new Span(index, end, Kind.LINK, text.substring(index, end)));
                    index = end;
                    continue;
                }
            }
            index++;
        }
        return spans;
    }

    /** True when an {@code https://} scheme starts at {@code index} as its own token. */
    private static boolean isSchemeStart(String text, int index) {
        if (!text.regionMatches(true, index, "https://", 0, 8)) return false;
        if (index == 0) return true;
        char before = text.charAt(index - 1);
        return !Character.isLetterOrDigit(before) && before != '_';
    }

    /** End offset of the link beginning at {@code start}, after trailing punctuation is trimmed. */
    private static int linkEnd(String text, int start) {
        int end = start + 8;
        while (end < text.length()) {
            char c = text.charAt(end);
            if (Character.isWhitespace(c) || c == '<' || c == '>' || c == '"' || c == '\''
                    || c == '`') break;
            end++;
        }
        if (end - start > MAX_LINK_CHARS) return start;
        while (end > start && isTrailingPunctuation(text.charAt(end - 1))) end--;
        if (!hasHost(text, start + 8, end)) return start;
        return end;
    }

    private static boolean isTrailingPunctuation(char c) {
        return c == '.' || c == ',' || c == ';' || c == ':' || c == '!' || c == '?'
                || c == ')' || c == ']' || c == '}' || c == '*';
    }

    /** A link needs a non-empty DNS-shaped authority before the path, query or fragment. */
    private static boolean hasHost(String text, int from, int to) {
        if (from >= to) return false;
        int hostEnd = from;
        boolean letterSeen = false;
        while (hostEnd < to) {
            char c = text.charAt(hostEnd);
            if (c == '/' || c == '?' || c == '#') break;
            if (!isHostChar(c)) return false;
            if (Character.isLetter(c)) letterSeen = true;
            hostEnd++;
        }
        if (hostEnd == from || !letterSeen) return false;
        char first = text.charAt(from);
        char last = text.charAt(hostEnd - 1);
        return first != '.' && first != '-' && first != ':' && last != '.' && last != '-'
                && last != ':';
    }

    private static boolean isHostChar(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                || c == '.' || c == '-' || c == ':';
    }
}
