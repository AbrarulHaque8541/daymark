package com.abrar.daymark;

import java.time.Instant;
import java.time.ZoneId;

/**
 * Pure reminder-occurrence policy shared by scheduling, receiver validation and host tests.
 * Snoozes are tied to the exact base occurrence so task edits invalidate old snoozes.
 */
final class ReminderSchedulePolicy {
    private static final char SEPARATOR = '\n';
    private static final int[] SNOOZE_PRESETS_MINUTES = {5, 10, 30};
    private static final String ACTION_BOOT_COMPLETED = "android.intent.action.BOOT_COMPLETED";
    private static final String ACTION_QUICKBOOT_POWERON = "android.intent.action.QUICKBOOT_POWERON";
    private static final String ACTION_TIME_CHANGED = "android.intent.action.TIME_SET";
    private static final String ACTION_TIMEZONE_CHANGED = "android.intent.action.TIMEZONE_CHANGED";

    private ReminderSchedulePolicy() { }

    static boolean shouldRescheduleForSystemChange(String action) {
        return ACTION_BOOT_COMPLETED.equals(action)
                || ACTION_QUICKBOOT_POWERON.equals(action)
                || ACTION_TIME_CHANGED.equals(action)
                || ACTION_TIMEZONE_CHANGED.equals(action);
    }

    static int[] snoozePresetsMinutes() {
        return SNOOZE_PRESETS_MINUTES.clone();
    }

    static String snoozeActionForMinutes(String actionPrefix, int minutes) {
        if (actionPrefix == null || actionPrefix.isEmpty()
                || !isSupportedSnoozeMinutes(minutes)) return null;
        return actionPrefix + "." + minutes;
    }

    static int snoozeMinutesForAction(String action, String actionPrefix, int legacyDefaultMinutes) {
        if (action == null || actionPrefix == null || actionPrefix.isEmpty()) return 0;
        if (actionPrefix.equals(action)) {
            return isSupportedSnoozeMinutes(legacyDefaultMinutes) ? legacyDefaultMinutes : 0;
        }
        for (int minutes : SNOOZE_PRESETS_MINUTES) {
            if (snoozeActionForMinutes(actionPrefix, minutes).equals(action)) return minutes;
        }
        return 0;
    }

    static boolean isSupportedSnoozeMinutes(int minutes) {
        for (int preset : SNOOZE_PRESETS_MINUTES) {
            if (minutes == preset) return true;
        }
        return false;
    }

    static Instant snoozeFire(Instant now, int minutes) {
        if (now == null || !isSupportedSnoozeMinutes(minutes)) return null;
        return now.plusSeconds(minutes * 60L);
    }

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
