package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Local, bounded typo-tolerant matching for the task-list search field. */
final class TaskSearch {
    // Exact substring search is always available, including for longer or punctuation-rich input.
    private static final int MAX_FUZZY_QUERY_CHARS = 160;
    private static final int MAX_FUZZY_TERMS = 6;
    private static final int MIN_FUZZY_TERM_CODE_POINTS = 4;
    private static final int MAX_FUZZY_TERM_CODE_POINTS = 32;

    private TaskSearch() { }

    static Query prepare(String input) {
        String normalized = input == null ? "" : input.trim().toLowerCase(Locale.ROOT);
        return new Query(normalized, fuzzyTerms(normalized));
    }

    static final class Query {
        private final String literal;
        private final List<Term> terms;

        private Query(String literal, List<Term> terms) {
            this.literal = literal;
            this.terms = terms;
        }

        boolean matches(Task task) {
            if (literal.isEmpty()) return true;
            // Preserve the existing searchable fields, boundaries and case-insensitive substring
            // behavior before trying the more permissive word-by-word fallback.
            String searchable = task.title.toLowerCase(Locale.ROOT)
                    + " " + task.notes.toLowerCase(Locale.ROOT)
                    + " " + String.join(" ", task.tags)
                    + " " + task.priority.toLowerCase(Locale.ROOT)
                    + " " + (task.dueDate == null ? "no date" : task.dueDate);
            if (searchable.contains(literal)) return true;
            if (terms.isEmpty()) return false;

            boolean[] matched = new boolean[terms.size()];
            int remaining = 0;
            for (int index = 0; index < terms.size(); index++) {
                Term term = terms.get(index);
                if (searchable.contains(term.text)) {
                    matched[index] = true;
                } else if (!term.fuzzyAllowed) {
                    // Short and numeric terms are exact-only, so they cannot create noisy matches.
                    return false;
                } else {
                    remaining++;
                }
            }
            if (remaining == 0) return true;

            int start = -1;
            int codePoints = 0;
            for (int offset = 0; offset <= searchable.length();) {
                int codePoint = offset < searchable.length() ? searchable.codePointAt(offset) : -1;
                if (codePoint >= 0 && isWordCodePoint(codePoint)) {
                    if (start < 0) start = offset;
                    codePoints++;
                } else if (start >= 0) {
                    if (codePoints <= MAX_FUZZY_TERM_CODE_POINTS + 1) {
                        for (int index = 0; index < terms.size(); index++) {
                            if (!matched[index] && withinOneEdit(terms.get(index).codePoints,
                                    searchable, start, offset, codePoints)) {
                                matched[index] = true;
                                if (--remaining == 0) return true;
                            }
                        }
                    }
                    start = -1;
                    codePoints = 0;
                }
                if (codePoint < 0) break;
                offset += Character.charCount(codePoint);
            }
            return false;
        }
    }

    private static final class Term {
        final String text;
        final int[] codePoints;
        final boolean fuzzyAllowed;

        Term(String text) {
            this.text = text;
            int count = text.codePointCount(0, text.length());
            codePoints = new int[count];
            boolean hasLetter = false;
            boolean hasDigit = false;
            int offset = 0;
            for (int index = 0; index < count; index++) {
                int codePoint = text.codePointAt(offset);
                codePoints[index] = codePoint;
                hasLetter |= Character.isLetter(codePoint);
                hasDigit |= Character.isDigit(codePoint);
                offset += Character.charCount(codePoint);
            }
            fuzzyAllowed = hasLetter && !hasDigit && count >= MIN_FUZZY_TERM_CODE_POINTS;
        }
    }

    private static List<Term> fuzzyTerms(String input) {
        if (input.isEmpty() || input.length() > MAX_FUZZY_QUERY_CHARS) return Collections.emptyList();
        List<Term> result = new ArrayList<>();
        int start = -1;
        boolean hasLetter = false;
        for (int offset = 0; offset <= input.length();) {
            int codePoint = offset < input.length() ? input.codePointAt(offset) : -1;
            if (codePoint >= 0 && isWordCodePoint(codePoint)) {
                hasLetter |= Character.isLetter(codePoint);
                if (start < 0) start = offset;
            } else {
                if (codePoint >= 0 && !isQuerySeparator(codePoint)) return Collections.emptyList();
                if (start >= 0) {
                    Term term = new Term(input.substring(start, offset));
                    if (term.codePoints.length > MAX_FUZZY_TERM_CODE_POINTS) return Collections.emptyList();
                    result.add(term);
                    if (result.size() > MAX_FUZZY_TERMS) return Collections.emptyList();
                    start = -1;
                }
            }
            if (codePoint < 0) break;
            offset += Character.charCount(codePoint);
        }
        return hasLetter ? result : Collections.emptyList();
    }

    private static boolean isQuerySeparator(int codePoint) {
        return Character.isWhitespace(codePoint) || codePoint == '-' || codePoint == '_'
                || codePoint == '#';
    }

    private static boolean isWordCodePoint(int codePoint) {
        if (Character.isLetterOrDigit(codePoint)) return true;
        int type = Character.getType(codePoint);
        return type == Character.NON_SPACING_MARK || type == Character.COMBINING_SPACING_MARK
                || type == Character.ENCLOSING_MARK;
    }

    /** One insertion, deletion, substitution, or adjacent transposition of Unicode code points. */
    private static boolean withinOneEdit(int[] term, String text, int start, int end, int textLength) {
        int difference = textLength - term.length;
        if (difference < -1 || difference > 1) return false;
        int offset = start;
        if (difference == 0) {
            int firstMismatch = -1;
            int firstTextCodePoint = -1;
            int mismatches = 0;
            for (int index = 0; index < term.length; index++) {
                int codePoint = text.codePointAt(offset);
                offset += Character.charCount(codePoint);
                if (term[index] == codePoint) continue;
                mismatches++;
                if (mismatches == 1) {
                    firstMismatch = index;
                    firstTextCodePoint = codePoint;
                } else if (mismatches != 2 || index != firstMismatch + 1
                        || firstTextCodePoint != term[index] || codePoint != term[firstMismatch]) {
                    return false;
                }
            }
            return true;
        }

        int index = 0;
        boolean skipped = false;
        while (index < term.length && offset < end) {
            int codePoint = text.codePointAt(offset);
            if (term[index] == codePoint) {
                index++;
                offset += Character.charCount(codePoint);
            } else {
                if (skipped) return false;
                skipped = true;
                if (difference > 0) offset += Character.charCount(codePoint);
                else index++;
            }
        }
        if (index == term.length && offset == end) return true;
        if (skipped) return false;
        if (difference < 0) return offset == end && index == term.length - 1;
        return index == term.length && offset < end
                && offset + Character.charCount(text.codePointAt(offset)) == end;
    }
}
