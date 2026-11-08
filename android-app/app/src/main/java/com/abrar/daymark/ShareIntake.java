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
        if (value == null) return "";
        // Android shares arrive from apps with different platform line-ending conventions.
        // Canonicalize them before detecting the first line, otherwise a classic-Mac CR or
        // Unicode paragraph separator can be mistaken for a one-line quick-add payload.
        return value.toString()
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .replace('\u2028', '\n')
                .replace('\u2029', '\n')
                .trim();
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
