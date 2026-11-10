package com.abrar.daymark;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Host-side parity tests for TaskOpenExport: renders the shared
 * contracts/task-export-fixture.json and compares byte-for-byte with the
 * expected strings the web prototype produced, plus focused unit checks.
 */
public final class TaskOpenExportSmoke {
    private static int assertions;

    private TaskOpenExportSmoke() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("usage: TaskOpenExportSmoke <task-export-fixture.json>");
        }
        String json = new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8);
        Map<String, Object> root = StrictJsonParser.object(StrictJsonParser.parse(json), "fixture");
        String generatedAt = StrictJsonParser.requiredString(root, "generatedAt");
        List<Task> tasks = new ArrayList<>();
        for (Object taskValue : StrictJsonParser.array(root.get("tasks"), "fixture.tasks")) {
            tasks.add(toTask(StrictJsonParser.object(taskValue, "task")));
        }
        Map<String, Object> expected = StrictJsonParser.object(root.get("expected"), "fixture.expected");

        check(TaskOpenExport.render("markdown", tasks, generatedAt)
                        .equals(StrictJsonParser.requiredString(expected, "markdown")),
                "markdown export matches the shared fixture byte-for-byte");
        check(TaskOpenExport.render("csv", tasks, generatedAt)
                        .equals(StrictJsonParser.requiredString(expected, "csv")),
                "csv export matches the shared fixture byte-for-byte");
        check(TaskOpenExport.render("ics", tasks, generatedAt)
                        .equals(StrictJsonParser.requiredString(expected, "ics")),
                "ics export matches the shared fixture byte-for-byte");

        List<Task> sorted = TaskOpenExport.sortTasks(tasks);
        check(sorted.size() == 4 && sorted.get(0).id.equals("task-alpha") && sorted.get(1).id.equals("task-delta")
                        && sorted.get(2).id.equals("task-gamma") && sorted.get(3).id.equals("task-beta"),
                "export sort order matches the web comparator (open by date, undated, completed last)");

        check("20261102T120000Z".equals(TaskOpenExport.icsDateStamp("2026-11-02T12:00:00.000Z")),
                "icsDateStamp renders the UTC basic-format instant");
        check("a\\\\b\\;c\\,d\\ne\\nf\\ng".equals(TaskOpenExport.icsEscapeText("a\\b;c,d\r\ne\nf\rg")),
                "icsEscapeText escapes backslash, semicolon, comma and all newline forms");
        check("\"a,b\"\"c\r\n\"".equals(TaskOpenExport.csvQuote("a,b\"c\r\n")),
                "csvQuote wraps and doubles quotes only when needed, newlines inside the quotes");
        check("plain".equals(TaskOpenExport.csvQuote("plain")), "csvQuote leaves plain values untouched");
        check("a\\\\b\\*c".equals(TaskOpenExport.mdEscape("a\\b*c")), "mdEscape escapes backslash and asterisk");
        check("[{\"id\":\"s1\",\"title\":\"Step \\\"one\\\"\",\"done\":true}]"
                        .equals(TaskOpenExport.subtasksJson(
                                Collections.singletonList(new Subtask("s1", "Step \"one\"", true)))),
                "subtasksJson matches JSON.stringify object escaping");
        check("\"\\u0001\"".equals(TaskOpenExport.jsonStringEscape("\u0001")),
                "jsonStringEscape emits \\u00xx for control characters");

        String longLine = repeat('x', 70) + "🎉".repeat(10) + repeat('y', 40);
        List<String> folded = TaskOpenExport.foldLine(longLine);
        boolean allWithinLimit = true;
        for (String physical : folded) {
            if (physical.getBytes(StandardCharsets.UTF_8).length > TaskOpenExport.ICS_LINE_OCTETS) {
                allWithinLimit = false;
            }
        }
        check(allWithinLimit && folded.size() > 1, "foldLine keeps every physical line within 75 UTF-8 octets");
        StringBuilder unfolded = new StringBuilder(folded.get(0));
        for (int i = 1; i < folded.size(); i++) unfolded.append(folded.get(i).substring(1));
        check(unfolded.toString().equals(longLine), "foldLine unfolds back to the exact logical line without splitting emoji");

        check("daymark-tasks-2026-11-02.ics".equals(TaskOpenExport.fileName("ics", "2026-11-02"))
                        && "daymark-tasks-undated.md".equals(TaskOpenExport.fileName("markdown", "nope")),
                "fileName builds dated and undated export names");
        check("text/calendar;charset=utf-8".equals(TaskOpenExport.mimeType("ics"))
                        && "text/csv;charset=utf-8".equals(TaskOpenExport.mimeType("csv"))
                        && "text/markdown;charset=utf-8".equals(TaskOpenExport.mimeType("markdown")),
                "mimeType maps every format");
        check(TaskOpenExport.isFormat("csv") && !TaskOpenExport.isFormat("json"), "isFormat accepts only the open formats");

        expectFailure(() -> TaskOpenExport.render("json", tasks, generatedAt), "unsupported format is rejected");
        expectFailure(() -> TaskOpenExport.render("markdown", null, generatedAt), "null task list is rejected");
        expectFailure(() -> TaskOpenExport.toMarkdown(tasks, "not a date"), "invalid generatedAt is rejected");
        expectFailure(() -> TaskOpenExport.enforceCap(new String(new char[TaskOpenExport.MAX_EXPORT_CHARS + 1])),
                "output above the safe cap is rejected");
        expectFailure(() -> TaskOpenExport.sortTasks(Collections.singletonList(task("bad-priority", "T", null, "urgent"))),
                "unknown priority is rejected");
        expectFailure(() -> TaskOpenExport.sortTasks(Collections.singletonList(task("bad-date", "T", "2026-02-30", "low"))),
                "impossible calendar date is rejected");
        expectFailure(() -> TaskOpenExport.sortTasks(Collections.singletonList(
                        new Task("lone", "\uD800", null, "low", false,
                                "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z"))),
                "lone surrogate in a title is rejected");
        expectFailure(() -> TaskOpenExport.sortTasks(Collections.singletonList(
                        new Task("bad-instant", "T", null, "low", false,
                                "yesterday", "2026-10-01T00:00:00Z"))),
                "unparseable createdAt is rejected");
        expectFailure(() -> TaskOpenExport.sortTasks(Collections.singletonList(
                        new Task("local-instant", "T", null, "low", false,
                                "2026-10-01T00:00:00", "2026-10-01T00:00:00Z"))),
                "createdAt without an explicit offset is rejected");
        expectFailure(() -> TaskOpenExport.sortTasks(Collections.singletonList(
                        new Task("bad-reminder-instant", "T", null, "low", false,
                                "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z",
                                Collections.<AttachmentRef>emptyList(), "", null, null,
                                "2026-11-10T10:00:00.1234567890Z", null,
                                Collections.<Subtask>emptyList()))),
                "invalid reminderShownFire is rejected by export");

        System.out.println("PASS task open export smoke tests: " + assertions + " assertions");
    }

    private static Task task(String id, String title, String dueDate, String priority) {
        return new Task(id, title, dueDate, priority, false,
                "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z");
    }

    private static String repeat(char c, int count) {
        char[] chars = new char[count];
        Arrays.fill(chars, c);
        return new String(chars);
    }

    private static Task toTask(Map<String, Object> values) {
        String id = StrictJsonParser.requiredString(values, "id");
        String title = StrictJsonParser.requiredString(values, "title");
        String dueDate = StrictJsonParser.optionalString(values, "dueDate", null);
        String dueTime = StrictJsonParser.optionalString(values, "dueTime", null);
        String priority = StrictJsonParser.requiredString(values, "priority");
        boolean completed = StrictJsonParser.requiredBoolean(values, "completed");
        String createdAt = StrictJsonParser.requiredString(values, "createdAt");
        String updatedAt = StrictJsonParser.optionalString(values, "updatedAt", createdAt);
        String notes = StrictJsonParser.optionalString(values, "notes", "");
        String repeat = StrictJsonParser.optionalString(values, "repeat", null);
        List<String> tags = new ArrayList<>();
        Object tagsValue = values.get("tags");
        if (tagsValue != null) {
            for (Object tag : StrictJsonParser.array(tagsValue, "tags")) {
                tags.add((String) tag);
            }
        }
        List<Subtask> subtasks = new ArrayList<>();
        Object subtasksValue = values.get("subtasks");
        if (subtasksValue != null) {
            for (Object subValue : StrictJsonParser.array(subtasksValue, "subtasks")) {
                Map<String, Object> sub = StrictJsonParser.object(subValue, "subtask");
                subtasks.add(new Subtask(StrictJsonParser.requiredString(sub, "id"),
                        StrictJsonParser.requiredString(sub, "title"),
                        StrictJsonParser.requiredBoolean(sub, "done")));
            }
        }
        return new Task(id, title, dueDate, priority, completed, createdAt, updatedAt,
                Collections.<AttachmentRef>emptyList(), notes, dueTime, null, null,
                repeat, null, subtasks, tags);
    }

    private static void expectFailure(Runnable operation, String message) {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected.
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
