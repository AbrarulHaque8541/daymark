package com.abrar.daymark;

import java.time.ZoneId;
import java.util.Collections;

/** Host-side tests for calendar event date/time and recurrence conversion. */
public final class CalendarEventDraftSmoke {
    public static void main(String[] args) {
        ZoneId newYork = ZoneId.of("America/New_York");
        Task allDayTask = task("2026-03-08", null, null, "notes");
        CalendarEventDraft allDay = CalendarEventDraft.fromTask(allDayTask, newYork);
        check(allDay.allDay, "date-only tasks become all-day events");
        check(allDay.endMillis - allDay.beginMillis == 23L * 60L * 60L * 1000L,
                "all-day events respect the spring DST day instead of assuming 24 hours");
        check("Review report".equals(allDay.title), "task title is preserved");
        check("notes".equals(allDay.description), "task notes are preserved");
        check("America/New_York".equals(allDay.timeZoneId), "calendar event carries the selected time zone");

        Task timedTask = task("2026-11-01", "01:30", "daily", "timed notes");
        CalendarEventDraft timed = CalendarEventDraft.fromTask(timedTask, newYork);
        check(!timed.allDay, "tasks with a due time become timed events");
        check(timed.endMillis - timed.beginMillis == 30L * 60L * 1000L,
                "timed tasks receive a bounded 30-minute default duration");
        check("FREQ=DAILY".equals(timed.recurrenceRule), "daily repeat maps to an RRULE");

        CalendarEventDraft weekly = CalendarEventDraft.fromTask(
                task("2026-06-15", null, "weekly", ""), ZoneId.of("UTC"));
        check("FREQ=WEEKLY".equals(weekly.recurrenceRule), "weekly repeat maps to an RRULE");

        CalendarEventDraft monthly = CalendarEventDraft.fromTask(
                task("2026-01-31", null, "monthly", ""), ZoneId.of("UTC"));
        check("FREQ=MONTHLY;BYMONTHDAY=31".equals(monthly.recurrenceRule),
                "monthly repeat preserves the task's day-of-month anchor");

        CalendarEventDraft noRepeat = CalendarEventDraft.fromTask(
                task("2026-06-15", null, null, ""), ZoneId.of("UTC"));
        check(noRepeat.recurrenceRule == null, "one-off tasks do not repeat in the calendar");

        expectFailure(() -> CalendarEventDraft.fromTask(task(null, null, null, ""), ZoneId.of("UTC")),
                "tasks without due dates cannot be exported as calendar events");
        expectFailure(() -> CalendarEventDraft.fromTask(allDayTask, null),
                "missing time zone fails closed");
        expectFailure(() -> CalendarEventDraft.fromTask(task("not-a-date", null, null, ""),
                ZoneId.of("UTC")), "malformed due dates fail closed");
        expectFailure(() -> CalendarEventDraft.fromTask(task("2026-06-15", "25:99", null, ""),
                ZoneId.of("UTC")), "malformed due times fail closed");

        System.out.println("PASS calendar event draft conversion");
    }

    private static Task task(String dueDate, String dueTime, String repeatRule, String notes) {
        return new Task("task-calendar-test", "Review report", dueDate, "medium", false,
                "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z",
                Collections.emptyList(), notes, dueTime, null, null,
                repeatRule, Collections.emptyList());
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
