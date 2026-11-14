package com.abrar.daymark;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * Open-format task export (Markdown / CSV / iCalendar) for the Android host.
 *
 * Pure Java: no Android imports, no IO, no network. Mirrors export-logic.js in the
 * web prototype byte-for-byte for the same inputs; contracts/task-export-fixture.json
 * pins the exact expected strings on both sides (TaskOpenExportSmoke verifies parity).
 */
public final class TaskOpenExport {
    public static final List<String> FORMATS = Arrays.asList("markdown", "csv", "ics");
    /** UTF-16 code units, identical to JavaScript string length. */
    public static final int MAX_EXPORT_CHARS = 2_000_000;
    /** RFC 5545 folding limit, counted in UTF-8 octets. */
    public static final int ICS_LINE_OCTETS = 75;
    public static final String CSV_HEADER =
            "id,title,dueDate,dueTime,priority,completed,repeat,tags,notes,subtasks,createdAt,updatedAt,repeatDayOfMonth";

    private static final Comparator<Task> EXPORT_ORDER = Comparator
            .comparing((Task task) -> task.completed)
            .thenComparing(task -> task.dueDate, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(task -> task.dueTime, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparingInt(task -> priorityRank(task.priority))
            .thenComparing(task -> requireInstant(task.createdAt, "createdAt"))
            .thenComparing(task -> task.id);

    private TaskOpenExport() { }

    public static boolean isFormat(String value) {
        return FORMATS.contains(value);
    }

    public static String render(String format, List<Task> tasks, String generatedAt) {
        if ("markdown".equals(format)) return toMarkdown(tasks, generatedAt);
        if ("csv".equals(format)) return toCsv(tasks, generatedAt);
        if ("ics".equals(format)) return toIcs(tasks, generatedAt);
        throw new IllegalArgumentException("Unsupported export format \"" + format
                + "\". Expected one of: markdown, csv, ics.");
    }

    public static String extension(String format) {
        if ("markdown".equals(format)) return "md";
        if ("csv".equals(format)) return "csv";
        if ("ics".equals(format)) return "ics";
        throw new IllegalArgumentException("Unsupported export format \"" + format + "\".");
    }

    public static String mimeType(String format) {
        if ("markdown".equals(format)) return "text/markdown;charset=utf-8";
        if ("csv".equals(format)) return "text/csv;charset=utf-8";
        if ("ics".equals(format)) return "text/calendar;charset=utf-8";
        throw new IllegalArgumentException("Unsupported export format \"" + format + "\".");
    }

    public static String fileName(String format, String dateStr) {
        String stamp = dateStr != null && dateStr.matches("\\d{4}-\\d{2}-\\d{2}") ? dateStr : "undated";
        return "daymark-tasks-" + stamp + "." + extension(format);
    }

    /** Validates every task (mirroring the web normalizeTask) and returns a sorted copy. */
    public static List<Task> sortTasks(List<Task> tasks) {
        if (tasks == null) throw new IllegalArgumentException("Export requires a list of tasks.");
        List<Task> sorted = new ArrayList<>(tasks.size());
        for (Task task : tasks) {
            sorted.add(validateTask(task));
        }
        sorted.sort(EXPORT_ORDER);
        return sorted;
    }

    private static Task validateTask(Task task) {
        if (task == null) throw new IllegalArgumentException("Export requires task objects.");
        requireCleanText(task.id, "id");
        if (task.id.isEmpty()) throw new IllegalArgumentException("Export task id must not be empty.");
        requireCleanText(task.title, "title");
        if (task.title.trim().isEmpty()) throw new IllegalArgumentException("Export task title must not be blank.");
        if (task.dueDate != null && !TaskLogic.isDateOnly(task.dueDate)) {
            throw new IllegalArgumentException("Export task dueDate \"" + task.dueDate + "\" is not a YYYY-MM-DD date.");
        }
        if (task.dueTime != null && !TaskDuePresets.isTimeOnly(task.dueTime)) {
            throw new IllegalArgumentException("Export task dueTime \"" + task.dueTime + "\" is not an HH:mm time.");
        }
        if (!TaskLogic.isPriority(task.priority)) {
            throw new IllegalArgumentException("Export task priority \"" + task.priority + "\" must be low, medium or high.");
        }
        requireInstant(task.createdAt, "createdAt");
        requireInstant(task.updatedAt == null ? task.createdAt : task.updatedAt, "updatedAt");
        if (task.reminderShownFire != null && !TaskLogic.isValidInstant(task.reminderShownFire)) {
            throw new IllegalArgumentException("Export task reminderShownFire is not a valid task instant.");
        }
        if (task.reminderShownFire != null && !TaskLogic.isValidInstant(task.reminderShownFire)) {
            throw new IllegalArgumentException("Export task reminderShownFire is not a valid task instant.");
        }
        requireCleanText(task.notes == null ? "" : task.notes, "notes");
        if (task.repeatRule != null) {
            requireCleanText(task.repeatRule, "repeat");
            if (task.dueDate == null || !TaskLogic.isRepeatRule(task.repeatRule)) {
                throw new IllegalArgumentException("Export repeat rule must be supported and requires a valid due date.");
            }
            if ("monthly".equals(task.repeatRule)) {
                if (!TaskLogic.isValidRepeatDayOfMonth(task.repeatDayOfMonth)) {
                    throw new IllegalArgumentException("Export monthly repeat day must be from 1 to 31.");
                }
            } else if ("yearly".equals(task.repeatRule)) {
                if (!TaskLogic.isValidYearlyAnchor(task.dueDate, task.repeatDayOfMonth)) {
                    throw new IllegalArgumentException("Export yearly repeat day must match the due date, except a clamped February 29.");
                }
            } else if (task.repeatDayOfMonth != null) {
                throw new IllegalArgumentException("Export repeat day is only valid for monthly or yearly rules.");
            }
        } else if (task.repeatDayOfMonth != null) {
            throw new IllegalArgumentException("Export repeat day requires a monthly or yearly rule.");
        }
        if (task.tags != null) {
            for (String tag : task.tags) requireCleanText(tag, "tags");
        }
        if (task.subtasks != null) {
            for (Subtask sub : task.subtasks) {
                requireCleanText(sub.id, "subtasks.id");
                requireCleanText(sub.title, "subtasks.title");
            }
        }
        return task;
    }

    private static void requireCleanText(String value, String field) {
        if (value == null) throw new IllegalArgumentException("Export field \"" + field + "\" must be a string.");
        if (hasLoneSurrogate(value)) {
            throw new IllegalArgumentException("Export field \"" + field + "\" contains a lone surrogate.");
        }
    }

    static boolean hasLoneSurrogate(String value) {
        for (int i = 0; i < value.length(); i++) {
            char current = value.charAt(i);
            if (Character.isHighSurrogate(current)) {
                if (i + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(i + 1))) return true;
                i++;
            } else if (Character.isLowSurrogate(current)) {
                return true;
            }
        }
        return false;
    }

    private static Instant requireInstant(String value, String field) {
        if (!TaskLogic.isValidInstant(value)) {
            throw new IllegalArgumentException("Export task " + field + " \"" + value + "\" is not a valid task instant.");
        }
        return Instant.parse(value);
    }

    /** Accepts the common ISO-8601 instant forms JavaScript's Date.parse accepts. */
    private static Instant parseInstantOrNull(String value) {
        if (value == null) return null;
        try { return Instant.parse(value); } catch (DateTimeParseException ignored) { }
        try { return OffsetDateTime.parse(value).toInstant(); } catch (DateTimeParseException ignored) { }
        try { return LocalDateTime.parse(value).toInstant(ZoneOffset.UTC); } catch (DateTimeParseException ignored) { }
        try { return LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant(); } catch (DateTimeParseException ignored) { }
        return null;
    }

    private static String requireGeneratedAt(String generatedAt) {
        if (parseInstantOrNull(generatedAt) == null) {
            throw new IllegalArgumentException("Export meta.generatedAt must be a parseable ISO instant.");
        }
        return generatedAt;
    }

    private static int priorityRank(String priority) {
        if ("high".equals(priority)) return 0;
        if ("medium".equals(priority)) return 1;
        return 2;
    }

    public static String enforceCap(String text) {
        if (text.length() > MAX_EXPORT_CHARS) {
            throw new IllegalArgumentException("Export output exceeds the safe size limit of "
                    + MAX_EXPORT_CHARS + " characters.");
        }
        return text;
    }

    public static String mdEscape(String text) {
        return text.replace("\\", "\\\\").replace("*", "\\*");
    }

    public static String toMarkdown(List<Task> tasks, String generatedAt) {
        String stamp = requireGeneratedAt(generatedAt);
        List<Task> sorted = sortTasks(tasks);
        List<String> blocks = new ArrayList<>();
        for (Task task : sorted) {
            String box = task.completed ? "[x]" : "[ ]";
            List<String> parts = new ArrayList<>();
            if (task.dueDate != null) {
                parts.add("due " + task.dueDate + (task.dueTime != null ? " " + task.dueTime : ""));
            }
            parts.add(task.priority + " priority");
            if (task.repeatRule != null) parts.add("repeats " + task.repeatRule);
            if (task.repeatDayOfMonth != null && task.dueDate != null
                    && task.repeatDayOfMonth.intValue() != Integer.parseInt(task.dueDate.substring(8))) {
                parts.add("repeat day " + task.repeatDayOfMonth);
            }
            if (task.tags != null) {
                for (String tag : task.tags) parts.add("#" + tag);
            }
            List<String> lines = new ArrayList<>();
            lines.add("- " + box + " **" + mdEscape(task.title) + "** · " + String.join(" · ", parts));
            String notes = task.notes == null ? "" : task.notes;
            if (!notes.isEmpty()) {
                for (String noteLine : notes.split("\n", -1)) lines.add("  " + noteLine);
            }
            if (task.subtasks != null) {
                for (Subtask sub : task.subtasks) {
                    lines.add("  - " + (sub.done ? "[x]" : "[ ]") + " " + mdEscape(sub.title));
                }
            }
            blocks.add(String.join("\n", lines));
        }
        StringBuilder out = new StringBuilder();
        out.append("# Daymark tasks\n_Exported ").append(stamp).append(" · ").append(sorted.size())
                .append(" task").append(sorted.size() == 1 ? "" : "s").append("_\n");
        if (!blocks.isEmpty()) {
            out.append('\n').append(String.join("\n\n", blocks)).append('\n');
        }
        return enforceCap(out.toString());
    }

    public static String csvQuote(String value) {
        if (value.indexOf('"') >= 0 || value.indexOf(',') >= 0
                || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            return '"' + value.replace("\"", "\"\"") + '"';
        }
        return value;
    }

    /** Matches JSON.stringify escaping for validated input without lone surrogates. */
    public static String jsonStringEscape(String value) {
        StringBuilder out = new StringBuilder(value.length() + 2);
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char code = value.charAt(i);
            switch (code) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\t': out.append("\\t"); break;
                case '\n': out.append("\\n"); break;
                case '\f': out.append("\\f"); break;
                case '\r': out.append("\\r"); break;
                default:
                    if (code < 0x20) {
                        String hex = Integer.toHexString(code);
                        out.append("\\u");
                        for (int pad = hex.length(); pad < 4; pad++) out.append('0');
                        out.append(hex);
                    } else {
                        out.append(code);
                    }
            }
        }
        return out.append('"').toString();
    }

    public static String subtasksJson(List<Subtask> subtasks) {
        StringBuilder out = new StringBuilder("[");
        if (subtasks != null) {
            for (int i = 0; i < subtasks.size(); i++) {
                Subtask sub = subtasks.get(i);
                if (i > 0) out.append(',');
                out.append("{\"id\":").append(jsonStringEscape(sub.id))
                        .append(",\"title\":").append(jsonStringEscape(sub.title))
                        .append(",\"done\":").append(sub.done ? "true" : "false").append('}');
            }
        }
        return out.append(']').toString();
    }

    public static String toCsv(List<Task> tasks, String generatedAt) {
        requireGeneratedAt(generatedAt); // metadata is required even though CSV ignores it
        List<String> rows = new ArrayList<>();
        rows.add(CSV_HEADER);
        for (Task task : sortTasks(tasks)) {
            List<String> fields = Arrays.asList(
                    task.id,
                    task.title,
                    task.dueDate == null ? "" : task.dueDate,
                    task.dueTime == null ? "" : task.dueTime,
                    task.priority,
                    task.completed ? "true" : "false",
                    task.repeatRule == null ? "" : task.repeatRule,
                    task.tags == null ? "" : String.join(" ", task.tags),
                    task.notes == null ? "" : task.notes,
                    subtasksJson(task.subtasks),
                    task.createdAt,
                    task.updatedAt == null ? task.createdAt : task.updatedAt,
                    task.repeatDayOfMonth == null ? "" : String.valueOf(task.repeatDayOfMonth));
            List<String> quoted = new ArrayList<>(fields.size());
            for (String field : fields) quoted.add(csvQuote(field));
            rows.add(String.join(",", quoted));
        }
        return enforceCap(String.join("\r\n", rows) + "\r\n");
    }

    public static String icsEscapeText(String text) {
        return text
                .replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n")
                .replace("\r", "\\n");
    }

    public static String icsDateStamp(String generatedAt) {
        Instant instant = parseInstantOrNull(generatedAt);
        if (instant == null) {
            throw new IllegalArgumentException("generatedAt must be a parseable ISO instant.");
        }
        return DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(instant);
    }

    public static int utf8Octets(int codePoint) {
        if (codePoint <= 0x7f) return 1;
        if (codePoint <= 0x7ff) return 2;
        if (codePoint <= 0xffff) return 3;
        return 4;
    }

    /**
     * RFC 5545 line folding: physical lines of at most 75 UTF-8 octets; continuation
     * lines start with a single space that counts toward the limit. Iterates code
     * points so a surrogate pair is never split.
     */
    public static List<String> foldLine(String line) {
        List<String> lines = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int count = 0;
        int index = 0;
        while (index < line.length()) {
            int codePoint = Character.codePointAt(line, index);
            int length = utf8Octets(codePoint);
            if (count + length > ICS_LINE_OCTETS) {
                lines.add(current.toString());
                current = new StringBuilder(" ");
                count = 1;
            }
            current.appendCodePoint(codePoint);
            count += length;
            index += Character.charCount(codePoint);
        }
        lines.add(current.toString());
        return lines;
    }

    private static String icsDescription(Task task) {
        List<String> lines = new ArrayList<>();
        String notes = task.notes == null ? "" : task.notes;
        if (!notes.isEmpty()) {
            for (String noteLine : notes.split("\n", -1)) lines.add(noteLine);
        }
        lines.add("Priority: " + task.priority);
        if (task.repeatRule != null) lines.add("Repeats: " + task.repeatRule);
        if (task.tags != null && !task.tags.isEmpty()) {
            List<String> tags = new ArrayList<>();
            for (String tag : task.tags) tags.add("#" + tag);
            lines.add("Tags: " + String.join(" ", tags));
        }
        if (task.subtasks != null && !task.subtasks.isEmpty()) {
            int doneCount = 0;
            for (Subtask sub : task.subtasks) {
                if (sub.done) doneCount++;
            }
            lines.add("Checklist: " + doneCount + "/" + task.subtasks.size() + " done");
            for (Subtask sub : task.subtasks) {
                lines.add("- " + (sub.done ? "[x] " : "[ ] ") + sub.title);
            }
        }
        return String.join("\n", lines);
    }

    public static String toIcs(List<Task> tasks, String generatedAt) {
        String stamp = requireGeneratedAt(generatedAt);
        String dateStamp = icsDateStamp(stamp);
        List<Task> sorted = sortTasks(tasks);
        List<String> logical = new ArrayList<>();
        logical.add("BEGIN:VCALENDAR");
        logical.add("VERSION:2.0");
        logical.add("PRODID:-//Daymark//Task Export//EN");
        logical.add("CALSCALE:GREGORIAN");
        logical.add("METHOD:PUBLISH");
        for (Task task : sorted) {
            logical.add("BEGIN:VEVENT");
            logical.add("UID:" + icsEscapeText(task.id) + "@daymark.export");
            logical.add("DTSTAMP:" + dateStamp);
            logical.add("SUMMARY:" + icsEscapeText(task.title));
            if (task.dueDate != null) {
                String day = task.dueDate.replace("-", "");
                if (task.dueTime != null) {
                    logical.add("DTSTART:" + day + "T" + task.dueTime.replace(":", "") + "00");
                } else {
                    logical.add("DTSTART;VALUE=DATE:" + day);
                }
            }
            logical.add("DESCRIPTION:" + icsEscapeText(icsDescription(task)));
            logical.add("STATUS:CONFIRMED");
            if (task.completed) logical.add("X-DAYMARK-COMPLETED:TRUE");
            logical.add("END:VEVENT");
        }
        logical.add("END:VCALENDAR");
        List<String> physical = new ArrayList<>();
        for (String line : logical) {
            physical.addAll(foldLine(line));
        }
        return enforceCap(String.join("\r\n", physical) + "\r\n");
    }
}
