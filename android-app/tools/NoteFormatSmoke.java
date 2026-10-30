package com.abrar.daymark;

import java.util.List;

/** Host-side coverage for the note formatter: inline code, HTTPS links, and their edge cases. */
public final class NoteFormatSmoke {
    private static int assertions;

    private NoteFormatSmoke() { }

    public static void main(String[] args) {
        plainTextHasNoSpans();
        inlineCode();
        httpsLinks();
        rejectedLinks();
        codeWinsOverLinks();
        spansAreSortedAndDisjoint();
        System.out.println("PASS note format smoke: " + assertions + " assertions");
    }

    private static void plainTextHasNoSpans() {
        check(NoteFormat.spans(null).isEmpty(), "null note has no spans");
        check(NoteFormat.spans("").isEmpty(), "empty note has no spans");
        check(NoteFormat.spans("Just a sentence.").isEmpty(), "plain text has no spans");
        check(NoteFormat.spans("<b>not markup</b>").isEmpty(), "HTML is not interpreted");
        check(NoteFormat.spans("**not bold**").isEmpty(), "Markdown emphasis is not interpreted");
    }

    private static void inlineCode() {
        String text = "Run `gradle test` now";
        List<NoteFormat.Span> spans = NoteFormat.spans(text);
        check(spans.size() == 1, "one code span");
        NoteFormat.Span code = spans.get(0);
        check(code.kind == NoteFormat.Kind.CODE, "code kind");
        check("gradle test".equals(text.substring(code.start, code.end)), "code excludes ticks");
        check(code.target == null, "code has no target");

        check(NoteFormat.spans("`x`").size() == 1, "single-character code");
        check(NoteFormat.spans("``").isEmpty(), "empty backticks are literal");
        check(NoteFormat.spans("`unclosed").isEmpty(), "unclosed backtick is literal");
        check(NoteFormat.spans("`line\nbreak`").isEmpty(), "code cannot cross a line");
        check(NoteFormat.spans("`a` and `b`").size() == 2, "two code spans");
    }

    private static void httpsLinks() {
        String text = "See https://example.com/docs for details";
        List<NoteFormat.Span> spans = NoteFormat.spans(text);
        check(spans.size() == 1, "one link span");
        NoteFormat.Span link = spans.get(0);
        check(link.kind == NoteFormat.Kind.LINK, "link kind");
        check("https://example.com/docs".equals(link.target), "link target keeps the path");
        check("https://example.com/docs".equals(text.substring(link.start, link.end)),
                "span covers the whole URL");
        check(NoteFormat.spans("https://example.com").get(0).target.equals("https://example.com"),
                "bare host links");

        check("https://example.com".equals(
                NoteFormat.spans("Read https://example.com.").get(0).target),
                "trailing full stop is trimmed");
        check("https://example.com".equals(
                NoteFormat.spans("(https://example.com)").get(0).target),
                "wrapping parenthesis is trimmed");
        check("https://example.com/a?b=c".equals(
                NoteFormat.spans("https://example.com/a?b=c, then").get(0).target),
                "query string survives, trailing comma does not");
        check("https://example.com:8443/x".equals(
                NoteFormat.spans("https://example.com:8443/x").get(0).target),
                "explicit port links");
    }

    private static void rejectedLinks() {
        check(NoteFormat.spans("http://example.com").isEmpty(), "plain HTTP is not linkified");
        check(NoteFormat.spans("xhttps://example.com").isEmpty(), "scheme must start a token");
        check(NoteFormat.spans("https://").isEmpty(), "scheme without host is literal");
        check(NoteFormat.spans("https:///path").isEmpty(), "empty authority is literal");
        check(NoteFormat.spans("https://exa_mple.com").isEmpty(), "underscore host is literal");
        check(NoteFormat.spans("https://-bad-.com").isEmpty(), "host cannot start or end with a hyphen");
        StringBuilder huge = new StringBuilder("https://");
        for (int i = 0; i < NoteFormat.MAX_LINK_CHARS; i++) huge.append('a');
        check(NoteFormat.spans(huge.toString()).isEmpty(), "over-long URL stays literal");
    }

    private static void codeWinsOverLinks() {
        List<NoteFormat.Span> spans = NoteFormat.spans("`https://example.com`");
        check(spans.size() == 1, "only the code span is produced");
        check(spans.get(0).kind == NoteFormat.Kind.CODE, "URL inside backticks stays code");
    }

    private static void spansAreSortedAndDisjoint() {
        String text = "`a` https://one.example https://two.example/x `b`";
        List<NoteFormat.Span> spans = NoteFormat.spans(text);
        check(spans.size() == 4, "two code and two link spans");
        int previousEnd = -1;
        for (NoteFormat.Span span : spans) {
            check(span.start >= previousEnd, "spans are sorted and do not overlap");
            check(span.end > span.start, "spans are non-empty");
            check(span.end <= text.length(), "spans stay inside the note");
            previousEnd = span.end;
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
