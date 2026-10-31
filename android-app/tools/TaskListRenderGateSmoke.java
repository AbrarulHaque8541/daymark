package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** JDK-only regression tests for task-row reuse and captured task snapshots. */
public final class TaskListRenderGateSmoke {
    private static final String STAMP = "2026-10-11T10:00:00Z";
    private static int assertions;

    private TaskListRenderGateSmoke() { }

    public static void main(String[] args) throws Exception {
        detectsAttachmentChangesWithoutTimestampChanges();
        detectsInputAndListChanges();
        detectsOtherChangesWithTheSameTimestamp();
        snapshotsTheListRatherThanRetainingAMutableContainer();
        taskSnapshotsAreImmutable();
        System.out.println("PASS task list render gate: " + assertions + " assertions");
    }

    private static void detectsInputAndListChanges() {
        TaskListRenderGate gate = TaskListRenderGate.create();
        Task first = task("t1", "Buy groceries");
        Task second = task("t2", "Call family");
        List<Task> visible = Arrays.asList(first, second);

        check(gate.shouldRebuild("all", "", visible, false), "initial list requires a rebuild");
        check(!gate.shouldRebuild("all", "", visible, false), "unchanged list is skipped");
        check(!gate.shouldRebuild("all", "", new ArrayList<>(visible), false),
                "a fresh list with the same immutable tasks is skipped");
        check(gate.shouldRebuild("all", "buy", visible, false), "query changes rebuild");
        check(!gate.shouldRebuild("all", new String("buy"), visible, false),
                "equivalent query strings do not force a rebuild");
        check(gate.shouldRebuild("today", "buy", visible, false), "filter changes rebuild");
        check(gate.shouldRebuild("today", "buy", "work", visible, false), "tag changes rebuild");
        check(!gate.shouldRebuild("today", "buy", "work", visible, false), "unchanged tag is skipped");
        check(gate.shouldRebuild("today", "buy", "", visible, false), "clearing the tag rebuilds");
        check(gate.shouldRebuild("today", "buy", "", visible, true), "save failure changes rebuild");
        check(gate.shouldRebuild("today", "buy", "", Arrays.asList(second, first), true),
                "reordering tasks rebuilds");
        check(gate.shouldRebuild("today", "buy", "", Collections.singletonList(first), true),
                "removing a visible task rebuilds");
        check(gate.shouldRebuild("today", "buy", "", visible, true), "adding a visible task rebuilds");
        gate.invalidate();
        check(gate.shouldRebuild("today", "buy", "", visible, true), "invalidation forces a rebuild");

        TaskListRenderGate empty = TaskListRenderGate.create();
        check(empty.shouldRebuild(null, null, null, null, false), "initial null input rebuilds");
        check(!empty.shouldRebuild("", "", "", Collections.emptyList(), false),
                "null filter values and list have the same meaning as empty values");

        TaskListRenderGate delimiters = TaskListRenderGate.create();
        check(delimiters.shouldRebuild("all", "one|two", "", visible, false),
                "first delimiter-bearing input rebuilds");
        check(delimiters.shouldRebuild("all", "one", "two|", visible, false),
                "distinct filter fields cannot collide through separators");
    }

    private static void detectsAttachmentChangesWithoutTimestampChanges() throws Exception {
        TaskListRenderGate gate = TaskListRenderGate.create();
        Task before = task("t1", "Read article");
        AttachmentRef attachment = new AttachmentRef(
                "11111111-1111-4111-8111-111111111111", "article.pdf", "application/pdf", 15);
        check(AttachmentLogic.isValid(attachment), "fixture is a valid attachment");
        List<Task> row = new ArrayList<>(Collections.singletonList(before));
        check(gate.shouldRebuild("all", "", row, false), "initial attachment-free row renders");

        // The real import path changes attachments without changing updatedAt. The row's
        // completion callback captures its Task instance, so reusing the old row would save a
        // task with no reference to the newly imported encrypted attachment.
        Task afterImport = before.withAttachments(Collections.singletonList(attachment));
        check(before.updatedAt.equals(afterImport.updatedAt), "fixture exercises unchanged updatedAt");
        row.set(0, afterImport);
        check(gate.shouldRebuild("all", "", row, false),
                "imported attachment must refresh the row and its captured task");
        Task rowCapturedAfterRebuild = row.get(0);
        Task completed = TaskLogic.toggleCompleted(rowCapturedAfterRebuild);
        check(completed.completed && completed.attachments.size() == 1
                        && completed.attachments.get(0).id.equals(attachment.id),
                "completion of the refreshed row retains the imported attachment");
        check(TaskLogic.isValid(completed), "the completed task and attachment remain valid");
        byte[] snapshot = TaskSnapshotCodec.encode(Collections.singletonList(completed),
                Collections.emptyList());
        Task reloaded = TaskSnapshotCodec.decode(snapshot).tasks.get(0);
        check(reloaded.completed && reloaded.attachments.size() == 1
                        && reloaded.attachments.get(0).id.equals(attachment.id),
                "the normal task snapshot round-trip keeps the attachment after completion");
        check(!gate.shouldRebuild("all", "", new ArrayList<>(row), false),
                "unchanged imported task skips a redundant rebuild");

        AttachmentRef replacement = new AttachmentRef(
                "22222222-2222-4222-8222-222222222222", "other.pdf", "application/pdf", 20);
        Task replaced = afterImport.withAttachments(Collections.singletonList(replacement));
        row.set(0, replaced);
        check(gate.shouldRebuild("all", "", row, false),
                "replacement with the same attachment count still refreshes the captured task");
        row.set(0, replaced.withAttachments(Collections.emptyList()));
        check(gate.shouldRebuild("all", "", row, false), "attachment removal refreshes the row");
    }

    private static void detectsOtherChangesWithTheSameTimestamp() {
        TaskListRenderGate gate = TaskListRenderGate.create();
        Task original = task("t1", "Before");
        List<Task> visible = new ArrayList<>(Collections.singletonList(original));
        check(gate.shouldRebuild("all", "", visible, false), "original task renders");
        Task edited = original.withFullDetails("After", "Updated note", original.dueDate,
                null, original.priority, null, null, Collections.emptyList(),
                Collections.singletonList("work"), STAMP);
        check(original.updatedAt.equals(edited.updatedAt), "edit fixture keeps the same timestamp");
        visible.set(0, edited);
        check(gate.shouldRebuild("all", "", visible, false),
                "title, note and tag edits refresh even with an unchanged timestamp");
        Task completed = edited.withCompleted(true, STAMP);
        visible.set(0, completed);
        check(gate.shouldRebuild("all", "", visible, false), "completion still refreshes the row");
        check(!gate.shouldRebuild("all", "", visible, false), "repeated completion state is skipped");
    }

    private static void snapshotsTheListRatherThanRetainingAMutableContainer() {
        TaskListRenderGate gate = TaskListRenderGate.create();
        Task one = task("t1", "One");
        Task two = task("t2", "Two");
        List<Task> mutable = new ArrayList<>(Collections.singletonList(one));
        check(gate.shouldRebuild("all", "", mutable, false), "mutable list initially renders");
        mutable.add(two);
        check(gate.shouldRebuild("all", "", mutable, false), "in-place list addition is detected");
        Collections.swap(mutable, 0, 1);
        check(gate.shouldRebuild("all", "", mutable, false), "in-place list reorder is detected");
        mutable.remove(1);
        check(gate.shouldRebuild("all", "", mutable, false), "in-place list removal is detected");
        check(!gate.shouldRebuild("all", "", mutable, false), "unchanged mutable list is skipped");
    }

    private static void taskSnapshotsAreImmutable() {
        List<AttachmentRef> attachments = new ArrayList<>();
        attachments.add(new AttachmentRef("11111111-1111-4111-8111-111111111111",
                "article.pdf", "application/pdf", 15));
        List<Subtask> subtasks = new ArrayList<>(Collections.singletonList(new Subtask("s1", "Read", false)));
        List<String> tags = new ArrayList<>(Collections.singletonList("work"));
        Task task = new Task("t1", "Task", null, "medium", false, STAMP, STAMP,
                attachments, "", null, null, null, null, subtasks, tags);
        attachments.clear();
        subtasks.clear();
        tags.clear();
        check(task.attachments.size() == 1, "attachment input is defensively copied");
        check(task.subtasks.size() == 1, "checklist input is defensively copied");
        check(task.tags.size() == 1, "tag input is defensively copied");
        expectImmutable(() -> task.attachments.clear(), "attachment list is immutable");
        expectImmutable(() -> task.subtasks.clear(), "checklist is immutable");
        expectImmutable(() -> task.tags.clear(), "tags are immutable");
    }

    private static void expectImmutable(Runnable action, String message) {
        boolean rejected = false;
        try {
            action.run();
        } catch (UnsupportedOperationException expected) {
            rejected = true;
        }
        check(rejected, message);
    }

    private static Task task(String id, String title) {
        return new Task(id, title, "2026-10-15", "high", false, STAMP, STAMP);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
