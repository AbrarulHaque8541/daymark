package com.abrar.daymark;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Host-side coverage for the tag chip filter and its share of the task-list render key. */
public final class TaskFilterSmoke {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);
    private static final String STAMP = "2026-10-05T00:00:00Z";
    private static int assertions;

    private TaskFilterSmoke() { }

    public static void main(String[] args) {
        tagFilterIsExactAndComposesWithQueryAndCategory();
        availableTagsAreSortedDistinctAndTolerant();
        renderGateIncludesTheSelectedTag();
        System.out.println("PASS task filter smoke: " + assertions + " assertions");
    }

    private static void tagFilterIsExactAndComposesWithQueryAndCategory() {
        List<Task> tasks = Arrays.asList(
                tagged("a", "Write report", "2026-10-01", false, "work", "urgent"),
                tagged("b", "Call mom", null, false, "family"),
                tagged("c", "Fix bike", "2026-10-01", false),
                tagged("d", "Old report", null, true, "work"));
        check(equal(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "", null, TODAY)),
                "a", "c", "b", "d"), "no tag filter keeps every task in task order");
        check(equal(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "", "work", TODAY)),
                "a", "d"), "tag filter keeps the exact tag only");
        check(equal(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "write", "work", TODAY)),
                "a"), "tag and query compose");
        check(equal(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_COMPLETED, "", "work", TODAY)),
                "d"), "tag and category compose");
        check(equal(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_OVERDUE, "", "work", TODAY)),
                "a"), "overdue and tag compose without dropping the date rule");
        check(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "", "WORK", TODAY).isEmpty(),
                "tag match is exact, not the query substring rule");
        check(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "", "missing", TODAY).isEmpty(),
                "unknown tag returns nothing");
        check(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, null, null, TODAY)).size() == 4,
                "null tag behaves like no tag");
        check(equal(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "", "  ", TODAY)),
                "a", "c", "b", "d"), "blank tag is ignored");
        check(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "", "", TODAY)
                .equals(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "", TODAY)),
                "the tag-free overload is the same query");
    }

    private static void availableTagsAreSortedDistinctAndTolerant() {
        List<Task> tasks = new ArrayList<>(Arrays.asList(
                tagged("a", "Write", null, false, "work", "urgent"),
                tagged("b", "Call", null, false, "family"),
                tagged("c", "Fix", null, false, "work")));
        tasks.add(null);
        check(equal(TaskLogic.availableTags(tasks), "family", "urgent", "work"),
                "tags are distinct and alphabetical");
        check(TaskLogic.availableTags(null).isEmpty(), "no tasks means no chips");
        check(TaskLogic.availableTags(Collections.emptyList()).isEmpty(), "empty store means no chips");

        List<Task> many = new ArrayList<>();
        for (int task = 0; task < 6; task++) {
            String a = tagName(task * 5);
            String b = tagName(task * 5 + 1);
            String c = tagName(task * 5 + 2);
            String d = tagName(task * 5 + 3);
            String e = tagName(task * 5 + 4);
            many.add(tagged("m" + task, "Task " + task, null, false, a, b, c, d, e));
        }
        List<String> chips = TaskLogic.availableTags(many);
        check(chips.size() == TaskLogic.MAX_TAG_CHIPS, "chip count is bounded");
        check("t00".equals(chips.get(0)) && "t23".equals(chips.get(23)),
                "bounded chips keep the lowest tags in order");
    }

    private static void renderGateIncludesTheSelectedTag() {
        List<Task> tasks = Arrays.asList(
                tagged("a", "Write report", null, false, "work"),
                tagged("b", "Call mom", null, false, "family"));
        List<Task> visible = TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "work", TODAY);
        TaskListRenderGate gate = new TaskListRenderGate();
        check(gate.shouldRebuild(TaskLogic.FILTER_ALL, "", "", visible, false),
                "first render rebuilds");
        check(!gate.shouldRebuild(TaskLogic.FILTER_ALL, "", "", visible, false),
                "identical key is skipped");
        check(gate.shouldRebuild(TaskLogic.FILTER_ALL, "", "work", visible, false),
                "changing the tag rebuilds");
        check(!gate.shouldRebuild(TaskLogic.FILTER_ALL, "", "work", visible, false),
                "same tag is skipped");
        check(gate.shouldRebuild(TaskLogic.FILTER_ALL, "", "", visible, false),
                "clearing the tag rebuilds");
    }

    private static Task tagged(String id, String title, String dueDate, boolean completed,
                               String... tags) {
        return new Task(id, title, dueDate, "normal", completed, STAMP, STAMP)
                .withTags(Arrays.asList(tags), STAMP);
    }

    private static String tagName(int index) {
        return "t" + String.format("%02d", index);
    }

    private static List<String> ids(List<Task> tasks) {
        List<String> ids = new ArrayList<>();
        for (Task task : tasks) ids.add(task.id);
        return ids;
    }

    private static boolean equal(List<String> actual, String... expected) {
        return actual.equals(Arrays.asList(expected));
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
