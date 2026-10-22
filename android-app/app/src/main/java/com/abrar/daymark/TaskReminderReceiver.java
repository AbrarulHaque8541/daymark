package com.abrar.daymark;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
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

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null || intent.getAction() == null ? "" : intent.getAction();
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
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            Log.i("DaymarkReminder", "Notification permission is denied; the reminder stays in the in-app dialog.");
            return;
        }
        
        // Validate the task still exists and the reminder is still valid
        if (!isReminderStillValid(context, taskId, fireInstant)) {
            Log.i("DaymarkReminder", "Stale reminder alarm for task " + taskId + "; notification suppressed.");
            return;
        }
        
        // Update the notification with the current task title
        String currentTitle = getCurrentTaskTitle(context, taskId);
        if (currentTitle == null || currentTitle.isEmpty()) {
            currentTitle = title; // Fall back to intent title if task not found
        }
        
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;
        TaskReminderScheduler.ensureChannel(context);
        PendingIntent open = PendingIntent.getActivity(context, notificationId,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, TaskReminderScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(currentTitle)
                .setContentText("Task reminder. Tap to open Daymark.")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build();
        notificationManager.notify(notificationId, notification);
    }

    /**
     * Validates that the reminder is still valid for the current task state.
     * Returns false if the task was deleted, completed, or had its reminder removed.
     */
    private boolean isReminderStillValid(Context context, String taskId, String fireInstant) {
        try {
            EncryptedTaskStore store = new EncryptedTaskStore(context);
            List<Task> tasks = store.load();
            for (Task task : tasks) {
                if (task.id.equals(taskId)) {
                    // Task exists - check if it still needs a reminder
                    if (task.completed) {
                        return false; // Task was completed
                    }
                    if (task.reminderLeadMinutes == null || task.dueDate == null) {
                        return false; // Reminder was removed or due date cleared
                    }
                    // Check if this is the same occurrence (not already shown)
                    if (fireInstant.equals(task.reminderShownFire)) {
                        return false; // Already shown for this occurrence
                    }
                    // Validate the fire instant matches the current task state
                    Instant fire = Instant.parse(fireInstant);
                    Instant expectedFire = TaskLogic.reminderFireInstant(task, java.time.ZoneId.systemDefault());
                    if (expectedFire == null || !fire.equals(expectedFire)) {
                        return false; // Due date or time changed
                    }
                    return true;
                }
            }
            // Task not found - was deleted
            return false;
        } catch (Exception e) {
            Log.w("DaymarkReminder", "Failed to validate reminder for task " + taskId, e);
            return false;
        }
    }

    /**
     * Gets the current title for a task, or null if not found.
     */
    private String getCurrentTaskTitle(Context context, String taskId) {
        try {
            EncryptedTaskStore store = new EncryptedTaskStore(context);
            List<Task> tasks = store.load();
            for (Task task : tasks) {
                if (task.id.equals(taskId)) {
                    return task.title;
                }
            }
            return null;
        } catch (Exception e) {
            Log.w("DaymarkReminder", "Failed to get current title for task " + taskId, e);
            return null;
        }
    }

    private void rescheduleAfterBoot(Context context) {
        try {
            EncryptedTaskStore store = new EncryptedTaskStore(context);
            List<Task> tasks = store.load();
            TaskReminderScheduler.rescheduleAll(context, tasks);
        } catch (Exception reminderRescheduleFailed) {
            Log.w("DaymarkReminder", "Boot reschedule failed; alarms retry on the next app open.",
                    reminderRescheduleFailed);
            context.getSharedPreferences(TaskReminderScheduler.REMINDER_PREFERENCES, Context.MODE_PRIVATE)
                    .edit().putBoolean(TaskReminderScheduler.BOOT_RESCHEDULE_FAILED_KEY, true).apply();
        }
    }
}
