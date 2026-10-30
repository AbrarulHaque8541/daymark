package com.abrar.daymark;

import java.time.Instant;
import java.time.ZoneId;

/**
 * Pure reminder-occurrence policy shared by scheduling, receiver validation and host tests.
 * Snoozes are tied to the exact base occurrence so task edits invalidate old snoozes.
 */
final class ReminderSchedulePolicy {
    private static final char SEPARATOR = '\n';

    private ReminderSchedulePolicy() { }

    static Instant baseFire(Task task, ZoneId zone) {
        if (task == null || task.completed || task.reminderLeadMinutes == null
                || task.dueDate == null) return null;
        return TaskLogic.reminderFireInstant(task, zone);
    }

    static String encodeSnooze(String baseFire, Instant snoozeFire) {
        if (baseFire == null || snoozeFire == null) return null;
        try {
            Instant base = Instant.parse(baseFire);
            if (!snoozeFire.isAfter(base)) return null;
            return base.toString() + SEPARATOR + snoozeFire.toString();
        } catch (RuntimeException invalid) {
            return null;
        }
    }

    static String validSnoozeFire(String record, String currentBaseFire) {
        if (record == null || currentBaseFire == null) return null;
        int separator = record.indexOf(SEPARATOR);
        if (separator <= 0 || separator == record.length() - 1
                || record.indexOf(SEPARATOR, separator + 1) >= 0) return null;
        try {
            String storedBase = Instant.parse(record.substring(0, separator)).toString();
            String snoozeText = Instant.parse(record.substring(separator + 1)).toString();
            if (!storedBase.equals(currentBaseFire)) return null;
            Instant base = Instant.parse(storedBase);
            Instant snooze = Instant.parse(snoozeText);
            return snooze.isAfter(base) ? snooze.toString() : null;
        } catch (RuntimeException invalid) {
            return null;
        }
    }

    static boolean acceptsFire(Task task, ZoneId zone, String deliveredFire, String snoozeRecord) {
        Instant base = baseFire(task, zone);
        if (base == null || deliveredFire == null
                || base.toString().equals(task.reminderShownFire)) return false;
        String baseText = base.toString();
        if (baseText.equals(deliveredFire)) return true;
        return deliveredFire.equals(validSnoozeFire(snoozeRecord, baseText));
    }

    static Instant scheduledFire(Task task, ZoneId zone, String snoozeRecord) {
        Instant base = baseFire(task, zone);
        if (base == null || base.toString().equals(task.reminderShownFire)) return null;
        String snooze = validSnoozeFire(snoozeRecord, base.toString());
        return snooze == null ? base : Instant.parse(snooze);
    }

    static boolean isSnoozedFire(Task task, ZoneId zone, String deliveredFire, String snoozeRecord) {
        Instant base = baseFire(task, zone);
        if (base == null || deliveredFire == null || base.toString().equals(deliveredFire)) return false;
        return deliveredFire.equals(validSnoozeFire(snoozeRecord, base.toString()));
    }
}
