package com.abrar.daymark;

/** User-reviewed plain-text representation for sharing a task to another installed app. */
final class TaskShareText {
    private TaskShareText() { }

    static String compose(Task task, boolean includeNotes) {
        if (task == null) throw new IllegalArgumentException("A task is required.");
        StringBuilder text = new StringBuilder();
        appendLine(text, task.title);
        if (task.dueDate != null && !task.dueDate.isEmpty()) {
            String due = task.dueDate;
            if (task.dueTime != null && !task.dueTime.isEmpty()) due += " " + task.dueTime;
            appendLine(text, "Due: " + due);
        }
        if (includeNotes && task.notes != null && !task.notes.trim().isEmpty()) {
            appendLine(text, "");
            appendLine(text, task.notes);
        }
        if (text.length() > 16_384) {
            throw new IllegalArgumentException("The selected task is too large to share.");
        }
        return text.toString().trim();
    }

    private static void appendLine(StringBuilder target, String value) {
        if (value == null || value.isEmpty()) return;
        if (target.length() > 0) target.append('\n');
        target.append(value);
    }
}
