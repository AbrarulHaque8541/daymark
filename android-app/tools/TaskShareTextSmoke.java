package com.abrar.daymark;

import java.util.Collections;

/** Host-side tests for the content Daymark sends through Android Sharesheet. */
public final class TaskShareTextSmoke {
    public static void main(String[] args) {
        Task task = new Task("share-test", "Prepare launch", "2026-11-01", "high", false,
                "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z",
                Collections.emptyList(), "Review checklist", "09:30", null, null,
                null, Collections.emptyList());
        String withoutNotes = TaskShareText.compose(task, false);
        check(withoutNotes.contains("Prepare launch"), "shared text includes the task title");
        check(withoutNotes.contains("Due: 2026-11-01 09:30"), "shared text includes due date and time");
        check(!withoutNotes.contains("Review checklist"), "notes are omitted unless the user opts in");

        String withNotes = TaskShareText.compose(task, true);
        check(withNotes.contains("Review checklist"), "opt-in share includes task notes");
        check(withNotes.indexOf("Due:") < withNotes.indexOf("Review checklist"),
                "due information appears before notes");

        Task undated = new Task("share-test-2", "Quick note", null, "medium", false,
                "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z");
        String undatedText = TaskShareText.compose(undated, true);
        check(!undatedText.contains("Due:"), "tasks without dates do not invent a due date");

        expectFailure(() -> TaskShareText.compose(null, false), "null task is rejected");
        StringBuilder huge = new StringBuilder();
        for (int index = 0; index < 17_000; index++) huge.append('x');
        Task oversized = new Task("share-test-3", "Large", null, "low", false,
                "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z",
                Collections.emptyList(), huge.toString(), null, null, null,
                null, Collections.emptyList());
        expectFailure(() -> TaskShareText.compose(oversized, true), "oversized content is rejected");

        System.out.println("PASS task text share formatter");
    }

    private static void expectFailure(Runnable operation, String message) {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected.
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
