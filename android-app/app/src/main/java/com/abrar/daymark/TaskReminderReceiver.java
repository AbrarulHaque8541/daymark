package com.abrar.daymark;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Log;

import java.time.Instant;
import java.util.List;

/**
 * Shows one scheduled task reminder, and restores the alarm schedule after a reboot.
 * The receiver is not exported: only Daymark's own alarms and protected system boot
 * broadcasts can reach it. No reminder text leaves the device.
 */
public final class TaskReminderReceiver extends BroadcastReceiver {
    static final String EXTRA_NOTIFICATION_ID = "daymark.extra.notification_id";
    static final String EXTRA_TASK_ID = "daymark.extra.task_id";
    static final String EXTRA_TASK_TITLE = "daymark.extra.task_title";
    static final String EXTRA_FIRE_INSTANT = "daymark.extra.fire_instant";
    /** Sent by the notification's Snooze action; the distinct action keeps its PendingIntent separate. */
    static final String ACTION_SNOOZE = "daymark.action.snooze_reminder";
    static final String ACTION_DISMISS = "daymark.action.dismiss_reminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null || intent.getAction() == null ? "" : intent.getAction();
        if (ACTION_SNOOZE.equals(action)) {
            snoozeReminder(context, intent);
            return;
        }
        if (ACTION_DISMISS.equals(action)) {
            dismissReminder(context, intent);
            return;
        }
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            rescheduleAfterBoot(context);
            return;
        }
        showReminder(context, intent);
    }

    private void showReminder(Context context, Intent intent) {
        int notificationId = intent == null ? 0 : intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        String taskId = intent == null ? null : intent.getStringExtra(EXTRA_TASK_ID);
        String title = intent == null ? null : intent.getStringExtra(EXTRA_TASK_TITLE);
        String fireInstant = intent == null ? null : intent.getStringExtra(EXTRA_FIRE_INSTANT);
        if (notificationId == 0 || taskId == null || title == null || title.trim().isEmpty() || fireInstant == null) {
            Log.w("DaymarkReminder", "A reminder alarm fired without usable details; no notification is shown.");
            return;
        }
        // Validate against current encrypted task state before trusting any alarm or
        // notification payload. The payload title is never used as the source of truth.
        Task currentTask = findValidReminderTask(context, taskId, fireInstant);
        if (currentTask == null || currentTask.title == null || currentTask.title.trim().isEmpty()) {
            Log.i("DaymarkReminder", "Stale or unverifiable reminder for task " + taskId + "; notification suppressed.");
            cancelNotification(context, notificationId);
            return;
        }

        Integer expectedNotificationId = TaskReminderScheduler.getNotificationId(context, taskId);
        if (expectedNotificationId == null || expectedNotificationId != notificationId) {
            Log.i("DaymarkReminder", "Reminder alarm ID no longer matches the task's current request code; notification suppressed.");
            cancelNotification(context, notificationId);
            return;
        }

        java.time.ZoneId zone = java.time.ZoneId.systemDefault();
        Instant baseFire = TaskLogic.reminderFireInstant(currentTask, zone);
        if (baseFire == null) {
            cancelNotification(context, notificationId);
            return;
        }
        String snoozeRecord = TaskReminderScheduler.snoozeRecord(context, taskId);
        boolean deliveredSnooze = ReminderSchedulePolicy.isSnoozedFire(
                currentTask, zone, fireInstant, snoozeRecord);
        if (deliveredSnooze) TaskReminderScheduler.clearSnooze(context, taskId);

        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            Log.i("DaymarkReminder", "Notification permission is denied; the reminder stays in the in-app dialog.");
            return;
        }

        // Notification metadata always carries the base occurrence, not the temporary
        // snooze alarm time. Reconciliation can therefore compare it with the task.
        refreshPostedNotification(context, notificationId, currentTask, baseFire.toString());
    }

    /**
     * Returns the current task only when the alarm still matches its live reminder state.
     * A null result means the task is deleted, completed, changed, already shown, or unreadable.
     */
    private Task findValidReminderTask(Context context, String taskId, String fireInstant) {
        try {
            EncryptedTaskStore store = new EncryptedTaskStore(context);
            List<Task> tasks = store.load();
            for (Task task : tasks) {
                if (!task.id.equals(taskId)) continue;
                if (task.completed || task.reminderLeadMinutes == null || task.dueDate == null) {
                    return null;
                }
                String snooze = TaskReminderScheduler.snoozeRecord(context, taskId);
                if (!ReminderSchedulePolicy.acceptsFire(task,
                        java.time.ZoneId.systemDefault(), fireInstant, snooze)) return null;
                return task;
            }
            return null; // deleted task
        } catch (Exception e) {
            Log.w("DaymarkReminder", "Failed to validate reminder for task " + taskId, e);
            return null; // fail closed when encrypted task state cannot be verified
        }
    }

    /** Posts or refreshes a task notification without re-alerting on metadata-only edits. */
    static void refreshPostedNotification(Context context, int notificationId, Task task, String fireInstant) {
        if (task == null || task.title == null || task.title.trim().isEmpty()) return;
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;
        TaskReminderScheduler.ensureChannel(context);
        PendingIntent open = PendingIntent.getActivity(context, notificationId,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent snooze = PendingIntent.getBroadcast(context, notificationId,
                new Intent(context, TaskReminderReceiver.class)
                        .setAction(ACTION_SNOOZE)
                        .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                        .putExtra(EXTRA_TASK_ID, task.id)
                        .putExtra(EXTRA_TASK_TITLE, task.title)
                        .putExtra(EXTRA_FIRE_INSTANT, fireInstant),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent dismiss = PendingIntent.getBroadcast(context, notificationId,
                new Intent(context, TaskReminderReceiver.class)
                        .setAction(ACTION_DISMISS)
                        .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                        .putExtra(EXTRA_TASK_ID, task.id),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, TaskReminderScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(task.title)
                .setContentText("Reminder due · Tap to open Daymark")
                .setStyle(new Notification.BigTextStyle()
                        .bigText("It's time for this task. Open Daymark to review the details, "
                                + "or snooze the reminder for " + TaskReminderScheduler.SNOOZE_MINUTES
                                + " minutes."))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(context, android.R.drawable.ic_lock_idle_alarm),
                        "Snooze " + TaskReminderScheduler.SNOOZE_MINUTES + " min", snooze).build())
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel),
                        "Dismiss", dismiss).build())
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .build();
        notification.extras.putString(EXTRA_TASK_ID, task.id);
        notification.extras.putString(EXTRA_FIRE_INSTANT, fireInstant);
        notificationManager.notify(notificationId, notification);
    }

    /** Dismiss clears only this visible notification; task state and its schedule are unchanged. */
    private void dismissReminder(Context context, Intent intent) {
        int notificationId = intent == null ? 0 : intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        String taskId = intent == null ? null : intent.getStringExtra(EXTRA_TASK_ID);
        Integer expectedId = TaskReminderScheduler.getNotificationId(context, taskId);
        if (notificationId <= 0 || expectedId == null || expectedId != notificationId) {
            Log.i("DaymarkReminder", "Stale dismiss action ignored.");
            return;
        }
        cancelNotification(context, notificationId);
    }

    /**
     * Snooze only re-arms an alarm; it never touches the encrypted task store, so it cannot race
     * the open activity's snapshot writes.
     */
    private void snoozeReminder(Context context, Intent intent) {
        int notificationId = intent == null ? 0 : intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        String taskId = intent == null ? null : intent.getStringExtra(EXTRA_TASK_ID);
        String baseFire = intent == null ? null : intent.getStringExtra(EXTRA_FIRE_INSTANT);
        if (notificationId <= 0 || taskId == null || baseFire == null) {
            Log.w("DaymarkReminder", "A snooze action arrived without a task occurrence; nothing was scheduled.");
            return;
        }

        // Snooze is an action on a posted notification, not a trusted alarm. Re-read the
        // current task and verify both the base occurrence and canonical notification ID.
        Task currentTask = findValidReminderTask(context, taskId, baseFire);
        Integer expectedId = TaskReminderScheduler.getNotificationId(context, taskId);
        if (currentTask == null || expectedId == null || expectedId != notificationId) {
            cancelNotification(context, notificationId);
            TaskReminderScheduler.clearSnooze(context, taskId);
            Log.i("DaymarkReminder", "Stale snooze action ignored for task " + taskId);
            return;
        }

        if (TaskReminderScheduler.snooze(context, notificationId, currentTask, baseFire)) {
            cancelNotification(context, notificationId);
        }
    }

    private void cancelNotification(Context context, int notificationId) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(notificationId);
    }

    private void rescheduleAfterBoot(Context context) {
        try {
            EncryptedTaskStore store = new EncryptedTaskStore(context);
            List<Task> tasks = store.load();
            TaskReminderScheduler.rescheduleAll(context, tasks);
            context.getSharedPreferences(TaskReminderScheduler.REMINDER_PREFERENCES, Context.MODE_PRIVATE)
                    .edit().remove(TaskReminderScheduler.BOOT_RESCHEDULE_FAILED_KEY).apply();
        } catch (Exception reminderRescheduleFailed) {
            Log.w("DaymarkReminder", "Boot reschedule failed; alarms retry on the next app open.",
                    reminderRescheduleFailed);
            context.getSharedPreferences(TaskReminderScheduler.REMINDER_PREFERENCES, Context.MODE_PRIVATE)
                    .edit().putBoolean(TaskReminderScheduler.BOOT_RESCHEDULE_FAILED_KEY, true).apply();
        }
    }
}
