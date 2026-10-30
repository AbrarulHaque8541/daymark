package com.abrar.daymark;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Best-effort scheduler for task-reminder notifications.
 *
 * The per-task alarm request-code index is the single source of truth for both alarm
 * PendingIntents and notification IDs. Posted notifications are reconciled from their
 * own task/occurrence metadata, so a second mirrored ID index cannot drift out of sync.
 *
 * Alarms use inexact setAndAllowWhileIdle: Doze and battery saver may delay them.
 * The schedule is recomputed on task saves and app open; nothing polls in the background.
 */
final class TaskReminderScheduler {
    static final String REMINDER_PREFERENCES = "daymark.reminders.v1";
    static final String NOTIFICATION_SOUND_URI_KEY = "notification_sound_uri";
    static final String BOOT_RESCHEDULE_FAILED_KEY = "boot_reschedule_failed";
    static final String CHANNEL_ID = "daymark_task_reminders";
    private static final String CODE_PREFERENCES = "daymark.reminder.codes.v1";
    private static final String CODE_COUNTER_KEY = "next_request_code";
    private static final String SNOOZE_KEY_PREFIX = "snooze.";
    private static final int FIRST_REQUEST_CODE = 44000;
    private static final int REQUEST_NOTIFICATION_PERMISSION = 44021;
    private static final String CHANNEL_SOUND_KEY = "channel_sound_uri";
    private static final String LOG_TAG = "DaymarkReminder";

    private TaskReminderScheduler() { }

    static final int SNOOZE_MINUTES = 10;

    /** POST_NOTIFICATIONS (Android 13+) is requested only when the user enables a reminder. */
    static void requestNotificationPermissionIfNeeded(Activity activity) {
        if (activity == null || Build.VERSION.SDK_INT < 33) return;
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS },
                REQUEST_NOTIFICATION_PERMISSION);
    }

    /**
     * Persist the snooze against the current base occurrence before arming the replacement
     * PendingIntent. This makes it survive app opens/reboots and lets task edits invalidate it.
     */
    static boolean snooze(Context context, int notificationId, Task task, String baseFireText) {
        if (context == null || task == null || notificationId <= 0) return false;
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.w(LOG_TAG, "Snooze not armed: AlarmManager is unavailable.");
            return false;
        }
        Instant base = ReminderSchedulePolicy.baseFire(task, ZoneId.systemDefault());
        Integer assigned = getNotificationId(context, task.id);
        if (base == null || !base.toString().equals(baseFireText)
                || assigned == null || assigned != notificationId
                || base.toString().equals(task.reminderShownFire)) {
            Log.i(LOG_TAG, "Snooze rejected because the task occurrence or notification ID is stale.");
            return false;
        }

        Instant snoozeFire = Instant.now().plusSeconds(SNOOZE_MINUTES * 60L);
        String record = ReminderSchedulePolicy.encodeSnooze(baseFireText, snoozeFire);
        if (record == null) return false;
        SharedPreferences preferences =
                context.getSharedPreferences(REMINDER_PREFERENCES, Context.MODE_PRIVATE);
        String key = snoozeKey(task.id);
        try {
            if (!preferences.edit().putString(key, record).commit()) {
                Log.w(LOG_TAG, "Snooze not armed: its state could not be persisted.");
                return false;
            }
        } catch (RuntimeException persistenceFailure) {
            Log.w(LOG_TAG, "Snooze not armed: its state could not be persisted.", persistenceFailure);
            return false;
        }

        Intent intent = reminderIntent(context, task.id);
        intent.putExtra(TaskReminderReceiver.EXTRA_NOTIFICATION_ID, notificationId);
        intent.putExtra(TaskReminderReceiver.EXTRA_FIRE_INSTANT, snoozeFire.toString());
        try {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeFire.toEpochMilli(),
                    PendingIntent.getBroadcast(context, notificationId, intent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            return true;
        } catch (RuntimeException schedulingFailure) {
            preferences.edit().remove(key).commit();
            Log.w(LOG_TAG, "Snooze could not be armed; saved snooze state was rolled back.",
                    schedulingFailure);
            return false;
        }
    }

    static String snoozeRecord(Context context, String taskId) {
        if (context == null || taskId == null) return null;
        SharedPreferences preferences =
                context.getSharedPreferences(REMINDER_PREFERENCES, Context.MODE_PRIVATE);
        return readString(preferences, snoozeKey(taskId));
    }

    static void clearSnooze(Context context, String taskId) {
        if (context == null || taskId == null) return;
        try {
            context.getSharedPreferences(REMINDER_PREFERENCES, Context.MODE_PRIVATE)
                    .edit().remove(snoozeKey(taskId)).apply();
        } catch (RuntimeException cleanupFailure) {
            Log.w(LOG_TAG, "Could not clear stale snooze state for task " + taskId,
                    cleanupFailure);
        }
    }

    private static String snoozeKey(String taskId) {
        return SNOOZE_KEY_PREFIX + taskId;
    }

    /**
     * Reconciles posted notifications independently of alarm availability, then repairs alarms.
     * A missing/corrupt preference entry cannot abort cleanup for every other task.
     */
    static void rescheduleAll(Context context, List<Task> tasks) {
        if (context == null || tasks == null) return;
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannel(context);

        SharedPreferences codes =
                context.getSharedPreferences(CODE_PREFERENCES, Context.MODE_PRIVATE);
        Map<String, Object> known = new HashMap<>();
        known.putAll(codes.getAll());
        Map<String, Task> liveTasks = new HashMap<>();
        for (Task task : tasks) {
            if (task != null && task.id != null) liveTasks.put(task.id, task);
        }
        SharedPreferences reminderPreferences =
                context.getSharedPreferences(REMINDER_PREFERENCES, Context.MODE_PRIVATE);
        for (String key : reminderPreferences.getAll().keySet()) {
            if (key.startsWith(SNOOZE_KEY_PREFIX)
                    && !liveTasks.containsKey(key.substring(SNOOZE_KEY_PREFIX.length()))) {
                reminderPreferences.edit().remove(key).apply();
            }
        }

        // Reconcile active app-owned reminder notifications first. This also recovers a missing
        // request-code entry from a valid notification's task ID and notification ID.
        reconcileActiveNotifications(context, alarmManager, notificationManager, codes, known, liveTasks);

        // Remove alarm slots and snooze state for deleted tasks. Notification cleanup above
        // does not depend on either preference index being present.
        for (Map.Entry<String, Object> entry : new HashMap<>(known).entrySet()) {
            String taskId = entry.getKey();
            if (CODE_COUNTER_KEY.equals(taskId)) continue;
            Integer requestCode = parsePositiveId(entry.getValue());
            if (requestCode == null) {
                Log.w(LOG_TAG, "Discarding malformed reminder request-code entry.");
                codes.edit().remove(taskId).apply();
                known.remove(taskId);
                clearSnooze(context, taskId);
                continue;
            }
            if (!liveTasks.containsKey(taskId)) {
                if (alarmManager != null) cancelAlarm(context, alarmManager, taskId, requestCode);
                cancelPostedNotification(notificationManager, requestCode);
                codes.edit().remove(taskId).apply();
                known.remove(taskId);
                clearSnooze(context, taskId);
            }
        }

        for (Task task : tasks) {
            if (task == null || task.id == null) continue;
            Object assignedValue = known.get(task.id);
            Integer assigned = parsePositiveId(assignedValue);
            boolean needsReminder = !task.completed && task.reminderLeadMinutes != null
                    && task.dueDate != null;
            Instant baseFire = ReminderSchedulePolicy.baseFire(task, ZoneId.systemDefault());
            boolean alreadyShown = baseFire != null
                    && baseFire.toString().equals(task.reminderShownFire);

            if (!needsReminder || baseFire == null || alreadyShown) {
                if (assigned != null) {
                    if (alarmManager != null) cancelAlarm(context, alarmManager, task.id, assigned);
                    cancelPostedNotification(notificationManager, assigned);
                    codes.edit().remove(task.id).apply();
                    known.remove(task.id);
                }
                clearSnooze(context, task.id);
                continue;
            }

            String storedSnooze = snoozeRecord(context, task.id);
            String validSnooze = ReminderSchedulePolicy.validSnoozeFire(
                    storedSnooze, baseFire.toString());
            if (storedSnooze != null && validSnooze == null) {
                clearSnooze(context, task.id);
                storedSnooze = null;
            }
            Instant nextFire = ReminderSchedulePolicy.scheduledFire(
                    task, ZoneId.systemDefault(), storedSnooze);
            if (alarmManager == null) {
                Log.w(LOG_TAG, "AlarmManager is unavailable; in-app reminder remains available.");
                continue;
            }
            if (nextFire == null || (!nextFire.isAfter(Instant.now())
                    && validSnooze == null)) {
                // Past base occurrences remain eligible for the in-app reminder flow. A past
                // snooze is different: arm it immediately because Doze may have delayed delivery.
                if (assigned != null) cancelAlarm(context, alarmManager, task.id, assigned);
                continue;
            }
            int requestCode = assigned == null ? requestCodeFor(context, task.id) : assigned;
            known.put(task.id, String.valueOf(requestCode));
            try {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextFire.toEpochMilli(),
                        pendingIntent(context, task, nextFire.toString(), requestCode));
            } catch (RuntimeException scheduleFailure) {
                // One malformed/unavailable alarm must not prevent the remaining tasks from
                // being reconciled. Keep the stable ID so the next app-open retry can repair it.
                Log.w(LOG_TAG, "Could not schedule reminder for task " + task.id, scheduleFailure);
            }
        }
    }

    private static void reconcileActiveNotifications(Context context, AlarmManager alarmManager,
            NotificationManager manager, SharedPreferences codes, Map<String, Object> known,
            Map<String, Task> liveTasks) {
        if (manager == null || Build.VERSION.SDK_INT < 23) return;
        StatusBarNotification[] active;
        try {
            active = manager.getActiveNotifications();
        } catch (RuntimeException unavailable) {
            Log.w(LOG_TAG, "Active reminder notifications could not be enumerated.", unavailable);
            return;
        }
        Set<String> seenTasks = new HashSet<>();
        for (StatusBarNotification posted : active) {
            Notification notification = posted.getNotification();
            if (notification == null || !CHANNEL_ID.equals(notification.getChannelId())) continue;
            android.os.Bundle extras = notification.extras;
            String taskId = extras == null ? null
                    : extras.getString(TaskReminderReceiver.EXTRA_TASK_ID);
            if (taskId == null) taskId = taskIdForNotificationId(known, posted.getId());
            Task task = taskId == null ? null : liveTasks.get(taskId);
            Instant baseFire = ReminderSchedulePolicy.baseFire(task, ZoneId.systemDefault());
            String baseFireText = baseFire == null ? null : baseFire.toString();
            String postedFire = extras == null ? null
                    : extras.getString(TaskReminderReceiver.EXTRA_FIRE_INSTANT);
            Integer assigned = taskId == null ? null : parsePositiveId(known.get(taskId));

            boolean valid = task != null && baseFireText != null
                    && !baseFireText.equals(task.reminderShownFire)
                    && baseFireText.equals(postedFire)
                    && (assigned == null || assigned == posted.getId())
                    && !seenTasks.contains(taskId);
            if (!valid) {
                cancelPostedNotification(manager, posted.getId());
                if (alarmManager != null && taskId != null) {
                    cancelAlarm(context, alarmManager, taskId, posted.getId());
                }
                continue;
            }

            // Recover the canonical ID from the notification itself if the preference entry
            // was lost. The same ID is used for its alarm PendingIntent.
            if (assigned == null) {
                String owner = taskIdForNotificationId(known, posted.getId());
                if (owner != null && !owner.equals(taskId)) {
                    manager.cancel(posted.getId());
                    continue;
                }
                known.put(taskId, String.valueOf(posted.getId()));
                codes.edit().putString(taskId, String.valueOf(posted.getId())).apply();
            }
            seenTasks.add(taskId);
            CharSequence postedTitle = extras == null ? null
                    : extras.getCharSequence(Notification.EXTRA_TITLE);
            if (postedTitle == null || !task.title.contentEquals(postedTitle)) {
                try {
                    TaskReminderReceiver.refreshPostedNotification(
                            context, posted.getId(), task, baseFireText);
                } catch (RuntimeException refreshFailure) {
                    Log.w(LOG_TAG, "Could not refresh reminder notification for task " + taskId,
                            refreshFailure);
                }
            }
        }
    }

    private static String taskIdForNotificationId(Map<String, Object> known, int notificationId) {
        for (Map.Entry<String, Object> entry : known.entrySet()) {
            if (CODE_COUNTER_KEY.equals(entry.getKey())) continue;
            Integer id = parsePositiveId(entry.getValue());
            if (id != null && id == notificationId) return entry.getKey();
        }
        return null;
    }

    private static Integer parsePositiveId(Object value) {
        if (value == null) return null;
        try {
            int parsed = Integer.parseInt(String.valueOf(value));
            return parsed > 0 ? parsed : null;
        } catch (RuntimeException invalid) {
            return null;
        }
    }

    private static void cancelAlarm(Context context, AlarmManager alarmManager,
            String taskId, int requestCode) {
        try {
            PendingIntent pending = PendingIntent.getBroadcast(context, requestCode,
                    reminderIntent(context, taskId),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pending != null) {
                alarmManager.cancel(pending);
                pending.cancel();
            }
        } catch (RuntimeException cancellationFailure) {
            Log.w(LOG_TAG, "Could not cancel stale reminder alarm for task " + taskId,
                    cancellationFailure);
        }
    }

    private static PendingIntent pendingIntent(Context context, Task task,
            String fireText, int requestCode) {
        Intent intent = reminderIntent(context, task.id);
        intent.putExtra(TaskReminderReceiver.EXTRA_NOTIFICATION_ID, requestCode);
        intent.putExtra(TaskReminderReceiver.EXTRA_FIRE_INSTANT, fireText);
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Intent reminderIntent(Context context, String taskId) {
        return new Intent(context, TaskReminderReceiver.class)
                .putExtra(TaskReminderReceiver.EXTRA_TASK_ID, taskId);
    }

    /** Stable ID shared by the alarm PendingIntent and the notification it posts. */
    static int requestCodeFor(Context context, String taskId) {
        SharedPreferences codes =
                context.getSharedPreferences(CODE_PREFERENCES, Context.MODE_PRIVATE);
        Integer existing = parsePositiveId(codes.getAll().get(taskId));
        if (existing != null) return existing;
        int next = FIRST_REQUEST_CODE;
        try {
            next = codes.getInt(CODE_COUNTER_KEY, FIRST_REQUEST_CODE);
        } catch (RuntimeException malformedCounter) {
            // A bad preference type must not abort every task's reminder scheduling.
            codes.edit().remove(CODE_COUNTER_KEY).apply();
            Log.w(LOG_TAG, "Discarding malformed reminder request-code counter.", malformedCounter);
        }
        if (next < FIRST_REQUEST_CODE || next == Integer.MAX_VALUE) next = FIRST_REQUEST_CODE;
        Set<Integer> used = new HashSet<>();
        for (Map.Entry<String, ?> entry : codes.getAll().entrySet()) {
            if (CODE_COUNTER_KEY.equals(entry.getKey())) continue;
            Integer id = parsePositiveId(entry.getValue());
            if (id != null) used.add(id);
        }
        while (used.contains(next) && next < Integer.MAX_VALUE - 1) next++;
        if (used.contains(next)) throw new IllegalStateException("No reminder request-code slots remain.");
        codes.edit().putString(taskId, String.valueOf(next))
                .putInt(CODE_COUNTER_KEY, next + 1).apply();
        return next;
    }

    /** Notification IDs deliberately share the single canonical alarm request-code index. */
    static Integer getNotificationId(Context context, String taskId) {
        if (context == null || taskId == null) return null;
        SharedPreferences codes =
                context.getSharedPreferences(CODE_PREFERENCES, Context.MODE_PRIVATE);
        Integer id = parsePositiveId(codes.getAll().get(taskId));
        if (id == null && codes.contains(taskId)) codes.edit().remove(taskId).apply();
        return id;
    }

    static void applySound(Context context, Uri picked) {
        SharedPreferences preferences =
                context.getSharedPreferences(REMINDER_PREFERENCES, Context.MODE_PRIVATE);
        if (picked == null) preferences.edit().remove(NOTIFICATION_SOUND_URI_KEY).apply();
        else preferences.edit().putString(NOTIFICATION_SOUND_URI_KEY, picked.toString()).apply();
        ensureChannel(context);
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) {
            Log.w(LOG_TAG, "NotificationManager is unavailable; reminders stay in-app only.");
            return;
        }
        SharedPreferences preferences =
                context.getSharedPreferences(REMINDER_PREFERENCES, Context.MODE_PRIVATE);
        String soundUri = readString(preferences, NOTIFICATION_SOUND_URI_KEY);
        String normalized = soundUri == null ? "" : soundUri;
        String previous = readString(preferences, CHANNEL_SOUND_KEY);
        if (previous != null && !previous.equals(normalized)) {
            try {
                notificationManager.deleteNotificationChannel(CHANNEL_ID);
            } catch (RuntimeException channelDeleteFailure) {
                Log.w(LOG_TAG, "Could not replace reminder notification channel.",
                        channelDeleteFailure);
            }
        }
        preferences.edit().putString(CHANNEL_SOUND_KEY, normalized).apply();
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "Task reminders", NotificationManager.IMPORTANCE_HIGH);
        Uri sound = soundUri == null
                ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                : Uri.parse(soundUri);
        channel.setSound(sound, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        try {
            notificationManager.createNotificationChannel(channel);
        } catch (RuntimeException channelFailure) {
            Log.w(LOG_TAG, "Reminder channel could not be configured; in-app reminders remain available.",
                    channelFailure);
        }
    }

    private static String readString(SharedPreferences preferences, String key) {
        try {
            return preferences.getString(key, null);
        } catch (RuntimeException malformedValue) {
            preferences.edit().remove(key).apply();
            Log.w(LOG_TAG, "Discarding malformed reminder preference: " + key, malformedValue);
            return null;
        }
    }

    private static void cancelPostedNotification(NotificationManager manager, int notificationId) {
        if (manager == null || notificationId <= 0) return;
        try {
            manager.cancel(notificationId);
        } catch (RuntimeException cancellationFailure) {
            Log.w(LOG_TAG, "Could not cancel stale reminder notification " + notificationId,
                    cancellationFailure);
        }
    }
}
