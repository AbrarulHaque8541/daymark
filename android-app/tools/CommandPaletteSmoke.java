package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Host-side coverage for the command palette's ranking and bound. */
public final class CommandPaletteSmoke {
    private static final String STAMP = "2026-10-05T00:00:00Z";
    private static int assertions;

    private CommandPaletteSmoke() { }

    public static void main(String[] args) {
        ranksByWhereTheQueryLands();
        openTasksBeatCompletedAtTheSameRank();
        listIsBounded();
        emptyQueryListsOpenWorkFirst();
        noMatchReturnsNothing();
        System.out.println("PASS command palette smoke: " + assertions + " assertions");
    }

    private static void ranksByWhereTheQueryLands() {
        Task prefix = newTask("a", "Report draft", "", false);
        Task contains = newTask("b", "Write the report", "", false);
        Task body = newTask("c", "Email Sam", "attach the report", false);
        List<Task> ranked = CommandPalette.matchingTasks(
                Arrays.asList(contains, body, prefix), "report", 10);
        check(ranked.size() == 3, "all three matches are kept");
        check("a".equals(ranked.get(0).id), "title prefix wins");
        check("b".equals(ranked.get(1).id), "title substring is second");
        check("c".equals(ranked.get(2).id), "notes match is last");
        check(CommandPalette.rank(prefix, "report") == 0, "prefix rank");
        check(CommandPalette.rank(contains, "report") == 1, "substring rank");
        check(CommandPalette.rank(body, "report") == 2, "notes rank");
        check(CommandPalette.rank(prefix, "zzz") == -1, "miss rank");
    }

    private static void openTasksBeatCompletedAtTheSameRank() {
        Task done = newTask("a", "Report done", "", true);
        Task open = newTask("b", "Report open", "", false);
        List<Task> ranked = CommandPalette.matchingTasks(Arrays.asList(done, open), "report", 10);
        check("b".equals(ranked.get(0).id), "open task ranks above a completed one");
        check("a".equals(ranked.get(1).id), "completed task still listed");
    }

    private static void listIsBounded() {
        List<Task> tasks = new ArrayList<>();
        for (int i = 0; i < 20; i++) tasks.add(newTask("id" + i, "Report " + i, "", false));
        check(CommandPalette.matchingTasks(tasks, "report", CommandPalette.MAX_RESULTS).size()
                == CommandPalette.MAX_RESULTS, "results are capped at MAX_RESULTS");
        check(CommandPalette.matchingTasks(tasks, "report", -1).size() == 20,
                "a negative limit means unbounded");
    }

    private static void emptyQueryListsOpenWorkFirst() {
        Task done = newTask("a", "Done", "", true);
        Task open = newTask("b", "Open", "", false);
        List<Task> ranked = CommandPalette.matchingTasks(Arrays.asList(done, open), "", 10);
        check("b".equals(ranked.get(0).id), "empty query lists open work first");
        check(CommandPalette.matchingTasks(Arrays.asList(done, open), null, 10).size() == 2,
                "null query behaves like empty");
    }

    private static void noMatchReturnsNothing() {
        check(CommandPalette.matchingTasks(
                Arrays.asList(newTask("a", "Alpha", "", false)), "omega", 10).isEmpty(),
                "no match yields an empty list");
        check(CommandPalette.matchingTasks(null, "alpha", 10).isEmpty(), "null store is safe");
    }

    private static Task newTask(String id, String title, String notes, boolean completed) {
        return new Task(id, title, null, "normal", completed, STAMP, STAMP,
                java.util.Collections.emptyList(), notes, null, null, null, null,
                java.util.Collections.emptyList());
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
