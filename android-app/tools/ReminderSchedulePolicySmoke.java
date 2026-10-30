package com.abrar.daymark;

import java.time.Instant;
import java.time.ZoneId;

/** Regression tests for reminder occurrence and snooze invalidation without Android dependencies. */
public final class ReminderSchedulePolicySmoke {
    private static int assertions;

    public static void main(String[] args) {
        ZoneId zone = ZoneId.of("UTC");
        Task task = TaskLogic.create("Snooze test", "2099-12-01", "high",
                null, null, 60, null);
        Instant base = ReminderSchedulePolicy.baseFire(task, zone);
        check(base != null, "active reminder has a base occurrence");
        String baseText = base.toString();
        Instant snooze = base.plusSeconds(10 * 60L);
        String record = ReminderSchedulePolicy.encodeSnooze(baseText, snooze);
        check(record != null, "valid snooze record is encoded");
        check(ReminderSchedulePolicy.validSnoozeFire(record, baseText).equals(snooze.toString()),
                "snooze record is bound to its base occurrence");
        check(ReminderSchedulePolicy.acceptsFire(task, zone, baseText, record),
                "original reminder occurrence remains valid");
        check(ReminderSchedulePolicy.acceptsFire(task, zone, snooze.toString(), record),
                "snoozed occurrence is accepted by receiver validation");
        check(ReminderSchedulePolicy.scheduledFire(task, zone, record).equals(snooze),
                "rescheduling preserves the active snooze instead of overwriting it");
        check(!ReminderSchedulePolicy.acceptsFire(task, zone, base.plusSeconds(60).toString(), record),
                "arbitrary alarm timestamps are rejected");
        check(ReminderSchedulePolicy.validSnoozeFire("corrupt", baseText) == null,
                "corrupt snooze state fails closed");

        Task changed = task.withDetails(task.title, "2099-12-02", task.priority,
                Instant.now().toString());
        Instant changedBase = ReminderSchedulePolicy.baseFire(changed, zone);
        check(changedBase != null && !changedBase.toString().equals(baseText),
                "editing the due date creates a new base occurrence");
        check(ReminderSchedulePolicy.validSnoozeFire(record, changedBase.toString()) == null,
                "old snooze is invalidated by a due-date edit");
        check(ReminderSchedulePolicy.scheduledFire(changed, zone, record).equals(changedBase),
                "stale snooze falls back to the newly computed reminder occurrence");

        Task completed = TaskLogic.toggleCompleted(task);
        check(!ReminderSchedulePolicy.acceptsFire(completed, zone, snooze.toString(), record),
                "completed tasks reject both original and snoozed alarms");
        Task shown = task.withReminderShown(baseText, Instant.now().toString());
        check(!ReminderSchedulePolicy.acceptsFire(shown, zone, baseText, record),
                "already-presented base occurrence is rejected");
        check(!ReminderSchedulePolicy.acceptsFire(shown, zone, snooze.toString(), record),
                "snooze cannot resurrect an already-presented occurrence");

        check(ReminderSchedulePolicy.encodeSnooze(baseText, base) == null,
                "snooze must be strictly later than its base occurrence");
        check(ReminderSchedulePolicy.validSnoozeFire(baseText + "\nnot-an-instant", baseText) == null,
                "invalid snooze timestamp fails closed");
        System.out.println("PASS ReminderSchedulePolicySmoke: " + assertions + " assertions");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
