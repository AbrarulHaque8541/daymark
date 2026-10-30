package com.abrar.daymark;

/**
 * Pure rules turning text shared into Daymark (ACTION_SEND, ACTION_PROCESS_TEXT) into a draft.
 *
 * <p>A single short line still goes to the natural-language quick add, which parses dates,
 * priorities and #tags. Anything the quick add cannot hold — multiple lines, more than
 * {@link #MAX_QUICK_ADD} characters, or an article link whose subject names it — opens the full
 * editor instead of silently truncating the user's text.
 */
final class ShareIntake {
    /** Same bound as the quick-add field's length filter. */
    static final int MAX_QUICK_ADD = 2048;
    /** Same bound as the editor's title field. */
    static final int MAX_TITLE = 160;

    static final class Draft {
        final String title;
        final String notes;
        final boolean openEditor;

        Draft(String title, String notes, boolean openEditor) {
            this.title = title;
            this.notes = notes;
            this.openEditor = openEditor;
        }

        boolean isEmpty() {
            return title.isEmpty() && notes.isEmpty();
        }
    }

    private ShareIntake() { }

    static Draft parse(CharSequence subject, CharSequence text) {
        String body = normalize(text);
        if (body.isEmpty()) return new Draft("", "", false);

        String subjectText = oneLine(normalize(subject));
        if (subjectText.length() > MAX_TITLE) subjectText = subjectText.substring(0, MAX_TITLE).trim();

        boolean singleLine = body.indexOf('\n') < 0;
        boolean linkWithSubject = !subjectText.isEmpty()
                && !subjectText.equals(body) && isHttpUrl(body);
        if (singleLine && body.length() <= MAX_QUICK_ADD && !linkWithSubject) {
            return new Draft(body, "", false);
        }

        String notes;
        String title;
        if (!subjectText.isEmpty()) {
            title = subjectText;
            notes = body;
        } else {
            int lineBreak = body.indexOf('\n');
            if (lineBreak >= 0) {
                title = body.substring(0, lineBreak);
                notes = body.substring(lineBreak + 1).trim();
            } else {
                title = body;
                notes = body;
            }
            if (title.length() > MAX_TITLE) title = title.substring(0, MAX_TITLE).trim();
        }
        if (notes.length() > TaskLogic.MAX_NOTES_CHARS) {
            notes = notes.substring(0, TaskLogic.MAX_NOTES_CHARS);
        }
        return new Draft(title.trim(), notes, true);
    }

    private static String normalize(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }

    private static String oneLine(String value) {
        int lineBreak = value.indexOf('\n');
        String first = lineBreak < 0 ? value : value.substring(0, lineBreak);
        return first.replace('\r', ' ').trim();
    }

    private static boolean isHttpUrl(String value) {
        String lower = value.trim().toLowerCase(java.util.Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }
}
