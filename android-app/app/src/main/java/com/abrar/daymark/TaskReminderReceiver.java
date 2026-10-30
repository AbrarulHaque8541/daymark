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
        String title = intent == null ? null : intent.getStringExtra(EXTRA_TASK_TITLE);
        if (notificationId == 0 || title == null || title.trim().isEmpty()) {
            Log.w("DaymarkReminder", "A reminder alarm fired without usable details; no notification is shown.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            Log.i("DaymarkReminder", "Notification permission is denied; the reminder stays in the in-app dialog.");
            return;
        }
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
                        .putExtra(EXTRA_TASK_ID, intent.getStringExtra(EXTRA_TASK_ID))
                        .putExtra(EXTRA_TASK_TITLE, title),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent dismiss = PendingIntent.getBroadcast(context, notificationId + 100000,
                new Intent(context, TaskReminderReceiver.class)
                        .setAction(ACTION_DISMISS)
                        .putExtra(EXTRA_NOTIFICATION_ID, notificationId),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, TaskReminderScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
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
                .setOnlyAlertOnce(true)
                .setAutoCancel(true)
                .build();
        notificationManager.notify(notificationId, notification);
    }

    /** Dismiss only clears this notification; it does not alter the task or its schedule. */
    private void dismissReminder(Context context, Intent intent) {
        int notificationId = intent == null ? 0 : intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        if (notificationId <= 0) {
            Log.w("DaymarkReminder", "A dismiss action arrived without a notification id.");
            return;
        }
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) notificationManager.cancel(notificationId);
    }

    /**
     * Snooze only re-arms an alarm; it never touches the encrypted task store, so it cannot race
     * the open activity's snapshot writes.
     */
    private void snoozeReminder(Context context, Intent intent) {
        int notificationId = intent == null ? 0 : intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        String taskId = intent == null ? null : intent.getStringExtra(EXTRA_TASK_ID);
        String title = intent == null ? null : intent.getStringExtra(EXTRA_TASK_TITLE);
        if (notificationId == 0 || title == null || title.trim().isEmpty()) {
            Log.w("DaymarkReminder", "A snooze action arrived without usable details; nothing was scheduled.");
            return;
        }
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) notificationManager.cancel(notificationId);
        TaskReminderScheduler.snooze(context, notificationId, taskId, title);
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
