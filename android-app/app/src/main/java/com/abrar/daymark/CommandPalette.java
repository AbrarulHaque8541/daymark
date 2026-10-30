package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Ranking for the command palette's task results.
 *
 * <p>A palette is only useful if the first row is the one the user meant, so matches are ordered
 * by where the query lands — title prefix, then title substring, then notes or tags — and open
 * tasks beat completed ones at the same rank. The list is bounded so the dialog never becomes a
 * second task screen.
 */
final class CommandPalette {
    static final int MAX_RESULTS = 6;

    private CommandPalette() { }

    static List<Task> matchingTasks(List<Task> tasks, String query, int limit) {
        String normalized = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<Task> ranked = new ArrayList<>();
        if (tasks != null) {
            for (Task task : tasks) {
                if (task != null && rank(task, normalized) >= 0) ranked.add(task);
            }
        }
        ranked.sort(Comparator
                .comparingInt((Task task) -> rank(task, normalized))
                .thenComparing(task -> task.completed)
                .thenComparing(task -> task.title == null ? "" : task.title.toLowerCase(Locale.ROOT))
                .thenComparing(task -> task.id));
        if (limit >= 0 && ranked.size() > limit) {
            return new ArrayList<>(ranked.subList(0, limit));
        }
        return ranked;
    }

    /** @return 0 for a title prefix, 1 for a title substring, 2 for notes or tags, -1 for no match. */
    static int rank(Task task, String normalizedQuery) {
        String title = task.title == null ? "" : task.title.toLowerCase(Locale.ROOT);
        if (normalizedQuery.isEmpty()) return 0;
        if (title.startsWith(normalizedQuery)) return 0;
        if (title.contains(normalizedQuery)) return 1;
        String body = (task.notes == null ? "" : task.notes.toLowerCase(Locale.ROOT))
                + " " + String.join(" ", task.tags);
        return body.contains(normalizedQuery) ? 2 : -1;
    }
}
