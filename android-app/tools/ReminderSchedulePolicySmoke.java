package com.abrar.daymark;

import java.time.Instant;
import java.time.ZoneId;

/** Regression tests for reminder occurrence and snooze invalidation without Android dependencies. */
public final class ReminderSchedulePolicySmoke {
    private static int assertions;

    public static void main(String[] args) {
        ZoneId zone = ZoneId.of("UTC");
        check(java.util.Arrays.equals(TaskLogic.REMINDER_LEADS, new int[] {0, 30, 60, 1440})
                        && !TaskLogic.isReminderLead(5)
                        && !TaskLogic.isReminderLead(10),
                "snooze presets do not expand the task's stored reminder-lead choices");
        check(java.util.Arrays.equals(ReminderSchedulePolicy.snoozePresetsMinutes(),
                        new int[] {5, 10, 30}),
                "notification snooze choices are short, standard, and long presets");
        check(ReminderSchedulePolicy.isSupportedSnoozeMinutes(5)
                        && ReminderSchedulePolicy.isSupportedSnoozeMinutes(10)
                        && ReminderSchedulePolicy.isSupportedSnoozeMinutes(30),
                "all offered snooze durations are accepted");
        check(!ReminderSchedulePolicy.isSupportedSnoozeMinutes(0)
                        && !ReminderSchedulePolicy.isSupportedSnoozeMinutes(60),
                "unoffered snooze durations are rejected");
        String actionPrefix = "daymark.action.snooze_reminder";
        Instant now = Instant.parse("2026-11-06T12:00:00Z");
        for (int minutes : ReminderSchedulePolicy.snoozePresetsMinutes()) {
            String action = ReminderSchedulePolicy.snoozeActionForMinutes(actionPrefix, minutes);
            check((actionPrefix + "." + minutes).equals(action),
                    "each notification snooze has a distinct action token");
            check(ReminderSchedulePolicy.snoozeMinutesForAction(action, actionPrefix, 10) == minutes,
                    "each notification action decodes to its displayed duration");
            int decodedMinutes = ReminderSchedulePolicy.snoozeMinutesForAction(action, actionPrefix, 10);
            check(ReminderSchedulePolicy.snoozeFire(now, decodedMinutes)
                            .equals(now.plusSeconds(minutes * 60L)),
                    "each notification action computes its exact temporary snooze offset");
        }
        check(ReminderSchedulePolicy.snoozeMinutesForAction(actionPrefix, actionPrefix, 10) == 10,
                "legacy notification snooze action retains its ten-minute behavior");
        check(ReminderSchedulePolicy.snoozeMinutesForAction(actionPrefix + ".60", actionPrefix, 10) == 0
                        && ReminderSchedulePolicy.snoozeActionForMinutes(actionPrefix, 60) == null,
                "unknown action durations fail closed");
        check(ReminderSchedulePolicy.snoozeFire(now, 5).equals(now.plusSeconds(5 * 60L)),
                "short snooze is scheduled for five minutes after selection");
        check(ReminderSchedulePolicy.snoozeFire(now, 10).equals(now.plusSeconds(10 * 60L)),
                "standard snooze is scheduled for ten minutes after selection");
        check(ReminderSchedulePolicy.snoozeFire(now, 30).equals(now.plusSeconds(30 * 60L)),
                "long snooze is scheduled for thirty minutes after selection");
        check(ReminderSchedulePolicy.snoozeFire(now, 60) == null
                        && ReminderSchedulePolicy.snoozeFire(null, 10) == null,
                "invalid snooze requests fail closed");
        ZoneId eastern = ZoneId.of("America/New_York");
        Task springDst = TaskLogic.create("Spring DST policy", "2026-03-08", "medium",
                "", "03:30", 60, null);
        Task fallDst = TaskLogic.create("Fall DST policy", "2026-11-01", "medium",
                "", "02:30", 60, null);
        check(Instant.parse("2026-03-08T06:30:00Z").equals(
                        ReminderSchedulePolicy.baseFire(springDst, eastern)),
                "reminder policy preserves a 60-minute elapsed lead after the spring-forward gap");
        check(Instant.parse("2026-11-01T06:30:00Z").equals(
                        ReminderSchedulePolicy.baseFire(fallDst, eastern)),
                "reminder policy preserves a 60-minute elapsed lead after the fall-back overlap");

        Task springThirty = TaskLogic.create("Spring DST 30-minute policy", "2026-03-08", "medium",
                "", "03:30", 30, null);
        Task springDay = TaskLogic.create("Spring DST 24-hour policy", "2026-03-08", "medium",
                "", "03:30", 1440, null);
        Task fallThirty = TaskLogic.create("Fall DST 30-minute policy", "2026-11-01", "medium",
                "", "02:30", 30, null);
        Task fallDay = TaskLogic.create("Fall DST 24-hour policy", "2026-11-01", "medium",
                "", "02:30", 1440, null);
        check(Instant.parse("2026-03-08T07:00:00Z").equals(
                        ReminderSchedulePolicy.baseFire(springThirty, eastern)),
                "reminder policy preserves a 30-minute elapsed lead across the spring-forward date boundary");
        check(Instant.parse("2026-03-07T07:30:00Z").equals(
                        ReminderSchedulePolicy.baseFire(springDay, eastern)),
                "reminder policy preserves a 24-hour elapsed lead across the spring-forward date boundary");
        check(Instant.parse("2026-11-01T07:00:00Z").equals(
                        ReminderSchedulePolicy.baseFire(fallThirty, eastern)),
                "reminder policy preserves a 30-minute elapsed lead across the fall-back date boundary");
        check(Instant.parse("2026-10-31T07:30:00Z").equals(
                        ReminderSchedulePolicy.baseFire(fallDay, eastern)),
                "reminder policy preserves a 24-hour elapsed lead across the fall-back date boundary");

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

        for (int minutes : ReminderSchedulePolicy.snoozePresetsMinutes()) {
            String action = ReminderSchedulePolicy.snoozeActionForMinutes(actionPrefix, minutes);
            int decodedMinutes = ReminderSchedulePolicy.snoozeMinutesForAction(action, actionPrefix, 10);
            Instant actionFire = base.plusSeconds(decodedMinutes * 60L);
            String actionRecord = ReminderSchedulePolicy.encodeSnooze(baseText, actionFire);
            check(ReminderSchedulePolicy.acceptsFire(task, zone, actionFire.toString(), actionRecord),
                    "each notification action schedules an accepted occurrence");
            check(!ReminderSchedulePolicy.acceptsFire(changed, zone, actionFire.toString(), actionRecord),
                    "each action's old occurrence is rejected after the due date changes");
        }

        Task changedDueTime = task.withFullDetails(task.title, task.notes, task.dueDate,
                "12:30", task.priority, task.reminderLeadMinutes, task.repeatRule,
                task.subtasks, task.tags, Instant.now().toString());
        Instant changedTimeBase = ReminderSchedulePolicy.baseFire(changedDueTime, zone);
        check(changedTimeBase != null && !changedTimeBase.equals(base),
                "editing the due time changes the base reminder occurrence");
        check(!ReminderSchedulePolicy.acceptsFire(changedDueTime, zone, snooze.toString(), record),
                "due-time edits invalidate old snooze actions");

        Task changedLead = task.withFullDetails(task.title, task.notes, task.dueDate,
                task.dueTime, task.priority, 30, task.repeatRule, task.subtasks,
                task.tags, Instant.now().toString());
        Instant changedLeadBase = ReminderSchedulePolicy.baseFire(changedLead, zone);
        check(changedLeadBase != null && !changedLeadBase.equals(base),
                "editing the reminder lead changes the base occurrence");
        check(!ReminderSchedulePolicy.acceptsFire(changedLead, zone, snooze.toString(), record),
                "lead-time edits invalidate old snooze actions");

        Task reminderOff = task.withFullDetails(task.title, task.notes, task.dueDate,
                task.dueTime, task.priority, null, task.repeatRule, task.subtasks,
                task.tags, Instant.now().toString());
        check(ReminderSchedulePolicy.baseFire(reminderOff, zone) == null
                        && !ReminderSchedulePolicy.acceptsFire(reminderOff, zone, snooze.toString(), record)
                        && ReminderSchedulePolicy.scheduledFire(reminderOff, zone, record) == null,
                "turning reminders off invalidates old snooze actions and alarms");

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
