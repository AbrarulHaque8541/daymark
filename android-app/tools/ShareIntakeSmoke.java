package com.abrar.daymark;

/** Host-side coverage for the text shared into Daymark. */
public final class ShareIntakeSmoke {
    private static int assertions;

    private ShareIntakeSmoke() { }

    public static void main(String[] args) {
        emptyTextIsIgnored();
        shortLinesStayInQuickAdd();
        longLinesOpenTheEditor();
        multilineTextIsSplitLosslessly();
        aLinkWithASubjectUsesBothFields();
        subjectsAreOneLineAndCapped();
        notesRespectTheEditorLimit();
        System.out.println("PASS share intake smoke: " + assertions + " assertions");
    }

    private static void emptyTextIsIgnored() {
        check(ShareIntake.parse(null, null).isEmpty(), "null text is ignored");
        check(ShareIntake.parse("subject", "").isEmpty(), "empty text is ignored");
        check(ShareIntake.parse("subject", "   \n  ").isEmpty(), "blank text is ignored");
    }

    private static void shortLinesStayInQuickAdd() {
        ShareIntake.Draft draft = ShareIntake.parse(null, "Email the landlord tomorrow");
        check(!draft.openEditor, "a short line stays in quick add");
        check("Email the landlord tomorrow".equals(draft.title), "the line becomes the draft title");
        check(draft.notes.isEmpty(), "quick add carries no notes");

        String atLimit = repeat('x', ShareIntake.MAX_QUICK_ADD);
        check(!ShareIntake.parse(null, atLimit).openEditor,
                "a line at the quick-add limit still fits");

        ShareIntake.Draft withSubject = ShareIntake.parse("Some subject", "Buy milk");
        check(!withSubject.openEditor && "Buy milk".equals(withSubject.title),
                "a non-link subject does not divert a short line to the editor");
    }

    private static void longLinesOpenTheEditor() {
        String overLimit = repeat('y', ShareIntake.MAX_QUICK_ADD + 1);
        ShareIntake.Draft draft = ShareIntake.parse(null, overLimit);
        check(draft.openEditor, "an over-long line opens the editor");
        check(draft.title.length() <= ShareIntake.MAX_TITLE, "the title is capped");
        check(draft.notes.equals(overLimit), "the full text is kept in notes");
    }

    private static void multilineTextIsSplitLosslessly() {
        ShareIntake.Draft draft = ShareIntake.parse(null, "Fix the sink\nCall the plumber about the leak");
        check(draft.openEditor, "multi-line text opens the editor");
        check("Fix the sink".equals(draft.title), "the first line becomes the title");
        check("Call the plumber about the leak".equals(draft.notes), "the rest becomes notes");

        ShareIntake.Draft crlf = ShareIntake.parse(null, "Title\r\nBody");
        check("Title".equals(crlf.title), "a CRLF line break does not leak into the title");
        check("Body".equals(crlf.notes), "a CRLF line break still splits notes");

        ShareIntake.Draft trailing = ShareIntake.parse(null, "Only a title\n\nAfter the gap");
        check(trailing.openEditor && "After the gap".equals(trailing.notes),
                "blank lines around the split are trimmed from notes");
    }

    private static void aLinkWithASubjectUsesBothFields() {
        ShareIntake.Draft draft = ShareIntake.parse(
                "Why the sky is blue", "https://example.com/article");
        check(draft.openEditor, "an article link with a subject opens the editor");
        check("Why the sky is blue".equals(draft.title), "the subject becomes the title");
        check("https://example.com/article".equals(draft.notes), "the link becomes the notes");

        ShareIntake.Draft insecure = ShareIntake.parse("Old page", "http://example.com");
        check(insecure.openEditor, "http links count as links for the subject rule");

        ShareIntake.Draft same = ShareIntake.parse("https://example.com", "https://example.com");
        check(!same.openEditor, "a subject identical to the link does not split the share");

        ShareIntake.Draft uppercase = ShareIntake.parse("Doc", "  HTTPS://EXAMPLE.COM/x  ");
        check(uppercase.openEditor, "the link check is case-insensitive");
        check("HTTPS://EXAMPLE.COM/x".equals(uppercase.notes), "notes are trimmed");
    }

    private static void subjectsAreOneLineAndCapped() {
        ShareIntake.Draft draft = ShareIntake.parse("First line\nsecond line", "a\nb");
        check("First line".equals(draft.title), "only the first subject line is used");

        String longSubject = repeat('s', ShareIntake.MAX_TITLE + 20);
        ShareIntake.Draft capped = ShareIntake.parse(longSubject, "a\nb");
        check(capped.title.length() == ShareIntake.MAX_TITLE, "the subject is capped at the title limit");
    }

    private static void notesRespectTheEditorLimit() {
        String body = "Title\n" + repeat('n', TaskLogic.MAX_NOTES_CHARS + 500);
        ShareIntake.Draft draft = ShareIntake.parse(null, body);
        check(draft.notes.length() == TaskLogic.MAX_NOTES_CHARS,
                "notes are capped at the editor limit");
    }

    private static String repeat(char value, int count) {
        StringBuilder builder = new StringBuilder(count);
        for (int i = 0; i < count; i++) builder.append(value);
        return builder.toString();
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
