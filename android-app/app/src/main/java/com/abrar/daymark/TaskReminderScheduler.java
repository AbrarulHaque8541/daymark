package com.abrar.daymark;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
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
 * Best-effort scheduler for OS task-reminder notifications.
 *
 * Honest limits, by design:
 * - Alarms use inexact setAndAllowWhileIdle: Doze and battery saver may delay them.
 * - The schedule is recomputed on every task save and app open; nothing polls in the background.
 * - The user-chosen notification sound is stored app-locally and never leaves the device.
 * - Repeating occurrences are scheduled from the task's current due date; nothing is pre-queued.
 */
final class TaskReminderScheduler {
    static final String REMINDER_PREFERENCES = "daymark.reminders.v1";
    static final String NOTIFICATION_SOUND_URI_KEY = "notification_sound_uri";
    static final String BOOT_RESCHEDULE_FAILED_KEY = "boot_reschedule_failed";
    static final String CHANNEL_ID = "daymark_task_reminders";
    private static final String CODE_PREFERENCES = "daymark.reminder.codes.v1";
    private static final String CODE_COUNTER_KEY = "next_request_code";
    private static final String NOTIFICATION_PREFERENCES = "daymark.reminder.notifications.v1";
    private static final String NOTIFICATION_ID_KEY = "notification_id";
    private static final int FIRST_REQUEST_CODE = 44000;
    private static final int REQUEST_NOTIFICATION_PERMISSION = 44021;
    private static final String CHANNEL_SOUND_KEY = "channel_sound_uri";
    private static final String LOG_TAG = "DaymarkReminder";

    private TaskReminderScheduler() { }

    /** Deferral applied by the notification's Snooze action. */
    static final int SNOOZE_MINUTES = 10;

    /**
     * Re-arms the reminder's existing alarm slot {@link #SNOOZE_MINUTES} from now.
     *
     * <p>The PendingIntent identity matches the one {@link #schedule} created for the task, so
     * this replaces the fired alarm rather than adding a second one: a later reschedule or a
     * completed task cancels the snoozed reminder through the same request code.
     */
    static void snooze(Context context, int requestCode, String taskId, String title) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null || requestCode <= 0
                || title == null || title.trim().isEmpty()) {
            Log.w(LOG_TAG, "Snooze could not be scheduled; the alarm slot or reminder details are missing.");
            return;
        }
        ensureChannel(context);
        long fireAt = System.currentTimeMillis() + SNOOZE_MINUTES * 60_000L;
        Intent intent = reminderIntent(context, taskId == null ? "" : taskId);
        intent.putExtra(TaskReminderReceiver.EXTRA_NOTIFICATION_ID, requestCode);
        intent.putExtra(TaskReminderReceiver.EXTRA_TASK_TITLE, title);
        intent.putExtra(TaskReminderReceiver.EXTRA_FIRE_INSTANT,
                Instant.ofEpochMilli(fireAt).toString());
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt,
                PendingIntent.getBroadcast(context, requestCode, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    /** POST_NOTIFICATIONS (Android 13+) is requested only when the user enables a reminder. */
    static void requestNotificationPermissionIfNeeded(Activity activity) {
        if (activity == null || Build.VERSION.SDK_INT < 33) return;
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS },
                REQUEST_NOTIFICATION_PERMISSION);
    }

    /** Cancels stale alarms and posted notifications, and reschedules every open task that has a reminder. */
    static void rescheduleAll(Context context, List<Task> tasks) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (alarmManager == null) {
            Log.w(LOG_TAG, "AlarmManager is unavailable; reminders stay in-app only.");
            return;
        }
        ensureChannel(context);
        SharedPreferences codes = context.getSharedPreferences(CODE_PREFERENCES, Context.MODE_PRIVATE);
        SharedPreferences notifications = context.getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE);
        Set<String> liveIds = new HashSet<>();
        for (Task task : tasks) liveIds.add(task.id);
        Map<String, ?> known = new HashMap<>(codes.getAll());
        Map<String, ?> knownNotifications = new HashMap<>(notifications.getAll());
        
        // Cancel alarms for deleted tasks using the alarm-code index.
        for (Map.Entry<String, ?> entry : known.entrySet()) {
            String taskId = entry.getKey();
            if (CODE_COUNTER_KEY.equals(taskId)) continue;
            if (!liveIds.contains(taskId)) {
                int requestCode = Integer.parseInt(String.valueOf(entry.getValue()));
                cancelAlarm(context, alarmManager, taskId, requestCode);
                codes.edit().remove(taskId).apply();
            }
        }
        // Clean notification records independently: the two preference indexes can
        // become inconsistent after interrupted writes or an older app version.
        for (Map.Entry<String, ?> entry : knownNotifications.entrySet()) {
            String taskId = entry.getKey();
            if (!liveIds.contains(taskId)) {
                int notificationId = Integer.parseInt(String.valueOf(entry.getValue()));
                cancelNotification(context, notificationManager, taskId, notificationId);
                notifications.edit().remove(taskId).apply();
            }
        }

        // Cancel alarms and notifications for tasks that no longer need reminders.
        for (Task task : tasks) {
            Object assigned = known.get(task.id);
            Object storedNotificationId = knownNotifications.get(task.id);
            boolean needsAlarm = !task.completed && task.reminderLeadMinutes != null
                    && task.dueDate != null;
            if (!needsAlarm) {
                if (assigned != null) {
                    int requestCode = Integer.parseInt(String.valueOf(assigned));
                    cancelAlarm(context, alarmManager, task.id, requestCode);
                    codes.edit().remove(task.id).apply();
                }
                if (storedNotificationId != null) {
                    int notificationId = Integer.parseInt(String.valueOf(storedNotificationId));
                    cancelNotification(context, notificationManager, task.id, notificationId);
                    notifications.edit().remove(task.id).apply();
                }
            } else {
                // The alarm-code and notification-ID indexes can diverge after an interrupted
                // write or older version. Do not overwrite the notification index while leaving
                // an older active notification behind under a different ID.
                if (storedNotificationId != null && (assigned == null
                        || !String.valueOf(assigned).equals(String.valueOf(storedNotificationId)))) {
                    int staleNotificationId = Integer.parseInt(String.valueOf(storedNotificationId));
                    cancelNotification(context, notificationManager, task.id, staleNotificationId);
                    notifications.edit().remove(task.id).apply();
                }
                reconcilePostedNotification(context, notificationManager, notifications, task);
                schedule(context, alarmManager, task);
            }
        }
    }

    /**
     * Reconcile an already-visible notification against the current task occurrence.
     * A changed occurrence invalidates the old notification; a title-only edit refreshes it.
     */
    private static void reconcilePostedNotification(Context context,
            NotificationManager notificationManager, SharedPreferences notifications, Task task) {
        if (notificationManager == null || Build.VERSION.SDK_INT < 23) return;
        Object storedId = notifications.getAll().get(task.id);
        if (storedId == null) return;
        int notificationId;
        try {
            notificationId = Integer.parseInt(String.valueOf(storedId));
        } catch (NumberFormatException invalidId) {
            Log.w(LOG_TAG, "Invalid stored notification ID for task " + task.id, invalidId);
            return;
        }
        StatusBarNotification[] active = notificationManager.getActiveNotifications();
        for (StatusBarNotification posted : active) {
            if (posted.getId() != notificationId) continue;
            android.app.Notification existing = posted.getNotification();
            android.os.Bundle extras = existing == null ? null : existing.extras;
            String postedTaskId = extras == null ? null
                    : extras.getString(TaskReminderReceiver.EXTRA_TASK_ID);
            String postedFire = extras == null ? null
                    : extras.getString(TaskReminderReceiver.EXTRA_FIRE_INSTANT);
            String postedTitle = extras == null ? null
                    : extras.getString(android.app.Notification.EXTRA_TITLE);
            Instant currentFire = TaskLogic.reminderFireInstant(task, ZoneId.systemDefault());
            String currentFireText = currentFire == null ? null : currentFire.toString();
            // Older notifications without lifecycle metadata cannot be safely trusted.
            if (!task.id.equals(postedTaskId) || currentFireText == null
                    || currentFireText.equals(task.reminderShownFire)
                    || !currentFireText.equals(postedFire)) {
                notificationManager.cancel(notificationId);
                notifications.edit().remove(task.id).apply();
                Log.i(LOG_TAG, "Canceled stale posted notification for task " + task.id);
            } else if (!task.title.equals(postedTitle)) {
                TaskReminderReceiver.refreshPostedNotification(context, notificationId, task, currentFireText);
                Log.i(LOG_TAG, "Refreshed posted notification title for task " + task.id);
            }
            return;
        }
    }

    private static void schedule(Context context, AlarmManager alarmManager, Task task) {
        Instant fire = TaskLogic.reminderFireInstant(task, ZoneId.systemDefault());
        if (fire == null) return;
        String fireText = fire.toString();
        if (fireText.equals(task.reminderShownFire)) return; // already presented for this occurrence
        if (!fire.isAfter(Instant.now())) return; // past occurrences stay with the in-app dialog flow
        int requestCode = requestCodeFor(context, task.id);
        SharedPreferences notifications = context.getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE);
        notifications.edit().putInt(task.id, requestCode).apply();
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fire.toEpochMilli(),
                pendingIntent(context, task, fireText, requestCode));
    }

    private static void cancelAlarm(Context context, AlarmManager alarmManager, String taskId, int requestCode) {
        PendingIntent pending = PendingIntent.getBroadcast(context, requestCode,
                reminderIntent(context, taskId),
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pending != null) {
            alarmManager.cancel(pending);
            pending.cancel();
        }
    }

    /** Cancels a posted notification for a task if it exists. */
    static void cancelNotification(Context context, NotificationManager notificationManager, String taskId, int requestCode) {
        if (notificationManager == null) {
            Log.w(LOG_TAG, "NotificationManager is unavailable; cannot cancel notification.");
            return;
        }
        notificationManager.cancel(requestCode);
    }

    private static PendingIntent pendingIntent(Context context, Task task, String fireText, int requestCode) {
        Intent intent = reminderIntent(context, task.id);
        intent.putExtra(TaskReminderReceiver.EXTRA_NOTIFICATION_ID, requestCode);
        intent.putExtra(TaskReminderReceiver.EXTRA_TASK_TITLE, task.title);
        intent.putExtra(TaskReminderReceiver.EXTRA_FIRE_INSTANT, fireText);
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Intent reminderIntent(Context context, String taskId) {
        Intent intent = new Intent(context, TaskReminderReceiver.class);
        intent.putExtra(TaskReminderReceiver.EXTRA_TASK_ID, taskId);
        return intent;
    }

    /** Stable, collision-free per-task request code; old ids are pruned on reschedule. */
    static int requestCodeFor(Context context, String taskId) {
        SharedPreferences codes = context.getSharedPreferences(CODE_PREFERENCES, Context.MODE_PRIVATE);
        String existing = codes.getString(taskId, null);
        if (existing != null) return Integer.parseInt(existing);
        int next = codes.getInt(CODE_COUNTER_KEY, FIRST_REQUEST_CODE);
        codes.edit().putString(taskId, String.valueOf(next))
                .putInt(CODE_COUNTER_KEY, next + 1).apply();
        return next;
    }

    /** Returns the notification ID (request code) for a given task, or null if not found. */
    static Integer getNotificationId(Context context, String taskId) {
        SharedPreferences notifications = context.getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE);
        if (!notifications.contains(taskId)) return null;
        return notifications.getInt(taskId, -1);
    }

    /** Stores the user-chosen sound; the channel is recreated so the change takes effect. */
    static void applySound(Context context, Uri picked) {
        SharedPreferences preferences =
                context.getSharedPreferences(REMINDER_PREFERENCES, Context.MODE_PRIVATE);
        if (picked == null) {
            preferences.edit().remove(NOTIFICATION_SOUND_URI_KEY).apply();
        } else {
            preferences.edit().putString(NOTIFICATION_SOUND_URI_KEY, picked.toString()).apply();
        }
        ensureChannel(context);
    }

    /** Creates (and on sound changes, recreates) the reminder notification channel. */
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
        String soundUri = preferences.getString(NOTIFICATION_SOUND_URI_KEY, null);
        String normalized = soundUri == null ? "" : soundUri;
        String previous = preferences.getString(CHANNEL_SOUND_KEY, null);
        if (previous != null && !previous.equals(normalized)) {
            notificationManager.deleteNotificationChannel(CHANNEL_ID);
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
        notificationManager.createNotificationChannel(channel);
    }
}
