package com.abrar.daymark;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lightweight natural-language quick-add for tasks.
 * Extracts relative dates, times, priority and #tags without external services.
 */
final class NaturalLanguageTaskParse {
    private NaturalLanguageTaskParse() { }

    private static final Pattern TIME_12 = Pattern.compile(
            "(?i)\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b");
    private static final Pattern TIME_24 = Pattern.compile(
            "\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b");
    private static final Pattern RELATIVE_DAYS = Pattern.compile(
            "(?i)\\bin\\s+(\\d+)\\s+(day|days|week|weeks)\\b");
    private static final Pattern WEEKDAY = Pattern.compile(
            "(?i)\\b(next\\s+)?(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\\b");
    private static final Pattern ORPHAN_LEADING = Pattern.compile(
            "^(?i)(at|on|by|for)\\s+");
    private static final Pattern ORPHAN_TRAILING = Pattern.compile(
            "(?i)\\s+(at|on|by|for)$");

    static final class Result {
        final String title;
        final String dueDate;
        final String dueTime;
        final String priority;
        final List<String> tags;

        Result(String title, String dueDate, String dueTime, String priority, List<String> tags) {
            this.title = title;
            this.dueDate = dueDate;
            this.dueTime = dueTime;
            this.priority = priority;
            this.tags = tags;
        }
    }

    static Result parse(String raw, LocalDate today) {
        if (raw == null || today == null) return new Result("", null, null, null, Collections.emptyList());
        String working = raw.trim();
        if (working.isEmpty()) return new Result("", null, null, null, Collections.emptyList());

        Set<String> tags = new LinkedHashSet<>();
        Matcher tagMatcher = Pattern.compile("#([A-Za-z0-9_\\-]+)").matcher(working);
        StringBuffer cleaned = new StringBuffer();
        while (tagMatcher.find()) {
            tags.add(tagMatcher.group(1).toLowerCase(Locale.ROOT));
            tagMatcher.appendReplacement(cleaned, " ");
        }
        tagMatcher.appendTail(cleaned);
        working = cleaned.toString();

        String priority = null;
        Matcher priorityMatcher = Pattern.compile("(?i)\\b(high|medium|low)\\b").matcher(working);
        if (priorityMatcher.find()) {
            priority = priorityMatcher.group(1).toLowerCase(Locale.ROOT);
            working = working.substring(0, priorityMatcher.start()) + " "
                    + working.substring(priorityMatcher.end());
        }

        String dueTime = null;
        Matcher time12 = TIME_12.matcher(working);
        if (time12.find()) {
            int hour = Integer.parseInt(time12.group(1));
            int minute = time12.group(2) == null ? 0 : Integer.parseInt(time12.group(2));
            String ampm = time12.group(3).toLowerCase(Locale.ROOT);
            if ("pm".equals(ampm) && hour < 12) hour += 12;
            if ("am".equals(ampm) && hour == 12) hour = 0;
            dueTime = String.format(Locale.ROOT, "%02d:%02d", hour, minute);
            working = working.substring(0, time12.start()) + " " + working.substring(time12.end());
        } else {
            Matcher time24 = TIME_24.matcher(working);
            if (time24.find()) {
                dueTime = String.format(Locale.ROOT, "%02d:%02d",
                        Integer.parseInt(time24.group(1)), Integer.parseInt(time24.group(2)));
                working = working.substring(0, time24.start()) + " " + working.substring(time24.end());
            }
        }

        String dueDate = null;
        Matcher weekday = WEEKDAY.matcher(working);
        Matcher relative = RELATIVE_DAYS.matcher(working);
        String lower = working.toLowerCase(Locale.ROOT);
        if (containsWord(lower, "today")) {
            dueDate = today.toString();
            working = removeWord(working, "(?i)\\btoday\\b");
        } else if (containsWord(lower, "day after tomorrow")) {
            dueDate = today.plusDays(2).toString();
            working = removeWord(working, "(?i)\\bday\\s+after\\s+tomorrow\\b");
        } else if (containsWord(lower, "tomorrow")) {
            dueDate = today.plusDays(1).toString();
            working = removeWord(working, "(?i)\\btomorrow\\b");
        } else if (containsWord(lower, "next week")) {
            dueDate = today.plusWeeks(1).toString();
            working = removeWord(working, "(?i)\\bnext\\s+week\\b");
        } else if (containsWord(lower, "this weekend") || containsWord(lower, "weekend")) {
            // Upcoming Saturday; if today is Saturday or Sunday, the following Saturday.
            int daysToSat = (DayOfWeek.SATURDAY.getValue() - today.getDayOfWeek().getValue() + 7) % 7;
            if (daysToSat == 0) daysToSat = 7;
            dueDate = today.plusDays(daysToSat).toString();
            working = removeWord(working, "(?i)\\b(this\\s+)?weekend\\b");
        } else if (relative.find()) {
            int amount = Integer.parseInt(relative.group(1));
            boolean weeks = relative.group(2).toLowerCase(Locale.ROOT).startsWith("week");
            dueDate = (weeks ? today.plusWeeks(amount) : today.plusDays(amount)).toString();
            working = working.substring(0, relative.start()) + " " + working.substring(relative.end());
        } else if (weekday.find()) {
            String dayToken = weekday.group(2).toLowerCase(Locale.ROOT);
            DayOfWeek target = dayOfWeek(dayToken);
            long days = (target.getValue() - today.getDayOfWeek().getValue() + 7) % 7;
            if (weekday.group(1) != null) {
                // "Next Monday" is in the following week. When today is Monday,
                // the nearest weekday is today, so the next one is exactly 7 days
                // away—not 14 days after applying both adjustments.
                days = days == 0 ? 7 : days + 7;
            } else if (days == 0) {
                // Plain weekday names always mean a strictly future occurrence.
                days = 7;
            }
            dueDate = today.plusDays(days).toString();
            working = working.substring(0, weekday.start()) + " " + working.substring(weekday.end());
        }
        if (dueTime != null && dueDate == null) dueDate = today.toString();

        String title = working.replaceAll("\\s+", " ")
                .replaceAll("^[,.:;\\-]+|[,.:;\\-]+$", "").trim();
        if (dueDate != null || dueTime != null) title = stripOrphanedConnectors(title);
        return new Result(title, dueDate, dueTime, priority, new ArrayList<>(tags));
    }

    /**
     * Removes a boundary "at/on/by/for" left behind after its date or time token was
     * consumed, so "Buy milk tomorrow at 5pm" becomes "Buy milk" rather than
     * "Buy milk at". Only boundary words are touched; "Water the plants at home
     * tomorrow" keeps its "at home".
     */
    private static String stripOrphanedConnectors(String title) {
        String cleaned = ORPHAN_LEADING.matcher(title).replaceAll("");
        cleaned = ORPHAN_TRAILING.matcher(cleaned).replaceAll("").trim();
        return cleaned;
    }

    private static boolean containsWord(String text, String word) {
        return Pattern.compile("(?i)\\b" + Pattern.quote(word) + "\\b").matcher(text).find();
    }

    private static String removeWord(String text, String regex) {
        return text.replaceAll(regex, " ");
    }

    private static DayOfWeek dayOfWeek(String token) {
        switch (token) {
            case "monday":
            case "mon": return DayOfWeek.MONDAY;
            case "tuesday":
            case "tue": return DayOfWeek.TUESDAY;
            case "wednesday":
            case "wed": return DayOfWeek.WEDNESDAY;
            case "thursday":
            case "thu": return DayOfWeek.THURSDAY;
            case "friday":
            case "fri": return DayOfWeek.FRIDAY;
            case "saturday":
            case "sat": return DayOfWeek.SATURDAY;
            case "sunday":
            case "sun": return DayOfWeek.SUNDAY;
            default: return DayOfWeek.MONDAY;
        }
    }
}
