package com.abrar.daymark;

import java.util.Collections;

/** Builds a bounded, reviewable offline task draft from Reader Mode's local text extraction. */
final class WebClip {
    static final int MAX_TITLE_CHARS = 160;
    static final int MAX_SOURCE_CHARS = 1000;
    static final int MAX_READER_CHARS = 60000;
    static final String TAG = "web-clip";

    enum SourceTreatment { UNCHANGED, PARAMETERS_REMOVED, ORIGIN_ONLY, OMITTED }

    /** Immutable so a draft can be retained across a configuration change without an Activity. */
    static final class Draft {
        final String title;
        final String notes;
        final boolean excerptShortened;
        final SourceTreatment sourceTreatment;

        private Draft(String title, String notes, boolean excerptShortened,
                      SourceTreatment sourceTreatment) {
            this.title = title;
            this.notes = notes;
            this.excerptShortened = excerptShortened;
            this.sourceTreatment = sourceTreatment;
        }

        Draft withTitle(String value) {
            return new Draft(value == null ? "" : value, notes, excerptShortened, sourceTreatment);
        }

        Draft withNotes(String value) {
            return new Draft(title, value == null ? "" : value, excerptShortened, sourceTreatment);
        }
    }

    private WebClip() { }

    static Draft fromReader(String pageTitle, String pageText, String pageUrl) {
        String rawText = pageText == null ? "" : pageText.trim();
        if (rawText.isEmpty()) throw new IllegalArgumentException("No readable text was found on this page.");
        // The reader is already bounded; this also protects callers that do not use its script.
        int readerEnd = safeEnd(rawText, Math.min(rawText.length(), MAX_READER_CHARS));
        String text = validUnicode(rawText.substring(0, readerEnd));
        Source source = sourceFor(pageUrl);
        String prefix = source.url.isEmpty() ? "" : "Source: " + source.url + "\n\n";
        int available = TaskLogic.MAX_NOTES_CHARS - prefix.length();
        int end = safeEnd(text, Math.min(text.length(), available));
        String excerpt = text.substring(0, end).trim();
        if (excerpt.isEmpty()) throw new IllegalArgumentException("No readable text fits in this clip.");
        boolean shortened = readerEnd < rawText.length() || end < text.length();
        return new Draft(taskTitle(pageTitle), prefix + excerpt, shortened, source.treatment);
    }

    /** This uses the same task schema and validation as every other task; it performs no I/O. */
    static Task createTask(Draft draft) {
        if (draft == null) throw new IllegalArgumentException("Clip draft is unavailable.");
        return TaskLogic.create(validUnicode(draft.title), null, "medium", validUnicode(draft.notes),
                null, null, null, null, Collections.singletonList(TAG));
    }

    static String taskTitle(String pageTitle) {
        String cleaned = validUnicode(pageTitle == null ? "" : pageTitle);
        StringBuilder line = new StringBuilder();
        boolean lastWasSpace = false;
        for (int index = 0; index < cleaned.length(); index++) {
            char ch = cleaned.charAt(index);
            if (Character.isWhitespace(ch) || Character.isISOControl(ch)) {
                if (line.length() > 0 && !lastWasSpace) line.append(' ');
                lastWasSpace = true;
            } else {
                line.append(ch);
                lastWasSpace = false;
            }
        }
        String value = line.toString().trim();
        if (value.isEmpty()) return "Read this article";
        String title = "Read: " + value;
        return title.substring(0, safeEnd(title, Math.min(title.length(), MAX_TITLE_CHARS))).trim();
    }

    private static Source sourceFor(String pageUrl) {
        final String checked;
        try {
            // In particular, reject credentials rather than attempting to preserve or log them.
            checked = BrowserAddress.requireAllowedWebUrl(pageUrl);
        } catch (IllegalArgumentException invalid) {
            return new Source("", SourceTreatment.OMITTED);
        }
        int end = checked.length();
        int query = checked.indexOf('?');
        int fragment = checked.indexOf('#');
        if (query >= 0) end = Math.min(end, query);
        if (fragment >= 0) end = Math.min(end, fragment);
        String clean = checked.substring(0, end);
        if (clean.length() > MAX_SOURCE_CHARS) {
            String origin = BrowserHistory.sanitizeUrl(clean);
            return origin == null || origin.length() > MAX_SOURCE_CHARS
                    ? new Source("", SourceTreatment.OMITTED)
                    : new Source(origin, SourceTreatment.ORIGIN_ONLY);
        }
        return new Source(clean, end < checked.length()
                ? SourceTreatment.PARAMETERS_REMOVED : SourceTreatment.UNCHANGED);
    }

    /** Avoid creating an unpaired UTF-16 surrogate at a length boundary. */
    private static int safeEnd(String value, int end) {
        if (end > 0 && end < value.length()
                && Character.isHighSurrogate(value.charAt(end - 1))
                && Character.isLowSurrogate(value.charAt(end))) return end - 1;
        return end;
    }

    /** Page scripts can return isolated surrogates; the task snapshot requires valid Unicode. */
    private static String validUnicode(String value) {
        StringBuilder result = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char ch = value.charAt(index);
            if (Character.isHighSurrogate(ch)) {
                if (index + 1 < value.length() && Character.isLowSurrogate(value.charAt(index + 1))) {
                    result.append(ch).append(value.charAt(++index));
                } else {
                    result.append('\uFFFD');
                }
            } else if (Character.isLowSurrogate(ch)) {
                result.append('\uFFFD');
            } else {
                result.append(ch);
            }
        }
        return result.toString();
    }

    private static final class Source {
        final String url;
        final SourceTreatment treatment;

        Source(String url, SourceTreatment treatment) {
            this.url = url;
            this.treatment = treatment;
        }
    }
}
