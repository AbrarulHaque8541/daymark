package com.abrar.daymark;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/** Deterministic conversion from a dated Daymark task to a local calendar event draft. */
final class CalendarEventDraft {
    static final long DEFAULT_DURATION_MINUTES = 30L;

    final String title;
    final String description;
    final boolean allDay;
    final long beginMillis;
    final long endMillis;
    final String timeZoneId;
    final String recurrenceRule;

    private CalendarEventDraft(String title, String description, boolean allDay,
                               long beginMillis, long endMillis, String timeZoneId,
                               String recurrenceRule) {
        this.title = title;
        this.description = description;
        this.allDay = allDay;
        this.beginMillis = beginMillis;
        this.endMillis = endMillis;
        this.timeZoneId = timeZoneId;
        this.recurrenceRule = recurrenceRule;
    }

    static CalendarEventDraft fromTask(Task task, ZoneId zone) {
        if (task == null) throw new IllegalArgumentException("A task is required.");
        if (task.dueDate == null || task.dueDate.isEmpty()) {
            throw new IllegalArgumentException("Add a due date before creating a calendar event.");
        }
        if (zone == null) throw new IllegalArgumentException("A calendar time zone is required.");

        LocalDate date;
        try {
            date = LocalDate.parse(task.dueDate);
        } catch (RuntimeException invalidDate) {
            throw new IllegalArgumentException("The task due date is invalid.", invalidDate);
        }

        boolean allDay = task.dueTime == null || task.dueTime.isEmpty();
        ZonedDateTime start;
        ZonedDateTime end;
        if (allDay) {
            start = date.atStartOfDay(zone);
            end = date.plusDays(1).atStartOfDay(zone);
        } else {
            LocalTime time;
            try {
                time = LocalTime.parse(task.dueTime);
            } catch (RuntimeException invalidTime) {
                throw new IllegalArgumentException("The task due time is invalid.", invalidTime);
            }
            start = date.atTime(time).atZone(zone);
            end = start.plusMinutes(DEFAULT_DURATION_MINUTES);
        }

        return new CalendarEventDraft(
                task.title == null ? "" : task.title,
                task.notes == null ? "" : task.notes,
                allDay,
                start.toInstant().toEpochMilli(),
                end.toInstant().toEpochMilli(),
                zone.getId(),
                recurrenceRule(task));
    }

    private static String recurrenceRule(Task task) {
        if ("daily".equals(task.repeatRule)) return "FREQ=DAILY";
        if ("weekly".equals(task.repeatRule)) return "FREQ=WEEKLY";
        if ("monthly".equals(task.repeatRule)) {
            Integer day = task.repeatDayOfMonth;
            return day == null ? "FREQ=MONTHLY" : "FREQ=MONTHLY;BYMONTHDAY=" + day;
        }
        return null;
    }
}
