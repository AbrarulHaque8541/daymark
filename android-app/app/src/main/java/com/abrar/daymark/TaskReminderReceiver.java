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
import java.time.LocalDate;
import java.util.List;

/**
 * Shows one scheduled task reminder and restores the alarm schedule after boot or
 * a system clock/timezone change. The receiver is not exported: only Daymark's own
 * alarms and platform boot/time broadcasts can reach it. No reminder text leaves the device.
 */
public final class TaskReminderReceiver extends BroadcastReceiver {
    static final String EXTRA_NOTIFICATION_ID = "daymark.extra.notification_id";
    static final String EXTRA_TASK_ID = "daymark.extra.task_id";
    static final String EXTRA_FIRE_INSTANT = "daymark.extra.fire_instant";
    /** Sent by the notification's Snooze action; the distinct action keeps its PendingIntent separate. */
    static final String ACTION_SNOOZE = "daymark.action.snooze_reminder";
    static final String ACTION_DISMISS = "daymark.action.dismiss_reminder";
    /** Opens the exact task behind a reminder instead of the generic home screen. */
    static final String ACTION_OPEN_TASK = "com.abrar.daymark.action.OPEN_REMINDER_TASK";
    /** Fixed ID for the sample notification posted from Settings; never a task reminder slot. */
    private static final int TEST_NOTIFICATION_ID = 43999;

    static String snoozeActionForMinutes(int minutes) {
        return ReminderSchedulePolicy.snoozeActionForMinutes(ACTION_SNOOZE, minutes);
    }

    static int snoozeMinutesForAction(String action) {
        // Keep notifications posted by older app versions working as the original 10-minute snooze.
        return ReminderSchedulePolicy.snoozeMinutesForAction(
                action, ACTION_SNOOZE, TaskReminderScheduler.SNOOZE_MINUTES);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null || intent.getAction() == null ? "" : intent.getAction();
        if (snoozeMinutesForAction(action) > 0) {
            snoozeReminder(context, intent);
            return;
        }
        if (ACTION_DISMISS.equals(action)) {
            dismissReminder(context, intent);
            return;
        }
        if (ReminderSchedulePolicy.shouldRescheduleForSystemChange(action)) {
            rescheduleAfterSystemChange(context);
            return;
        }
        showReminder(context, intent);
    }

    private void showReminder(Context context, Intent intent) {
        int notificationId = intent == null ? 0 : intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        String taskId = intent == null ? null : intent.getStringExtra(EXTRA_TASK_ID);
        String fireInstant = intent == null ? null : intent.getStringExtra(EXTRA_FIRE_INSTANT);
        if (notificationId <= 0 || taskId == null || fireInstant == null) {
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
        String snoozeChoices = snoozeChoicesSummary();
        PendingIntent open = PendingIntent.getActivity(context, notificationId,
                new Intent(context, MainActivity.class)
                        .setAction(ACTION_OPEN_TASK)
                        .putExtra(EXTRA_TASK_ID, task.id)
                        .setPackage(context.getPackageName()),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent dismiss = PendingIntent.getBroadcast(context, notificationId,
                new Intent(context, TaskReminderReceiver.class)
                        .setAction(ACTION_DISMISS)
                        .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                        .putExtra(EXTRA_TASK_ID, task.id),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(context, TaskReminderScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(task.title)
                .setContentText("Reminder due · Snooze " + snoozeChoices)
                .setSubText(subTextFor(task))
                .setStyle(new Notification.BigTextStyle()
                        .bigText("“" + task.title + "” is due. Tap to open it in Daymark, or snooze for "
                                + snoozeChoices + ". Swipe away to dismiss."))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion(context))
                .setContentIntent(open)
                .setDeleteIntent(dismiss)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true);
        for (int minutes : ReminderSchedulePolicy.snoozePresetsMinutes()) {
            Intent snoozeIntent = new Intent(context, TaskReminderReceiver.class)
                    .setAction(snoozeActionForMinutes(minutes))
                    .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                    .putExtra(EXTRA_TASK_ID, task.id)
                    .putExtra(EXTRA_FIRE_INSTANT, fireInstant);
            PendingIntent snooze = PendingIntent.getBroadcast(context, notificationId, snoozeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(new Notification.Action.Builder(
                    Icon.createWithResource(context, android.R.drawable.ic_lock_idle_alarm),
                    "Snooze " + minutes + " min", snooze).build());
        }
        Notification notification = builder.build();
        notification.extras.putString(EXTRA_TASK_ID, task.id);
        notification.extras.putString(EXTRA_FIRE_INSTANT, fireInstant);
        try {
            notificationManager.notify(notificationId, notification);
        } catch (RuntimeException notifyFailure) {
            Log.w("DaymarkReminder", "Could not publish reminder notification for task " + task.id,
                    notifyFailure);
        }
    }

    /**
     * Human-readable snooze choices, derived from the policy so the notification copy can never
     * advertise a snooze the app does not actually offer.
     */
    static String snoozeChoicesSummary() {
        int[] presets = ReminderSchedulePolicy.snoozePresetsMinutes();
        StringBuilder summary = new StringBuilder();
        for (int index = 0; index < presets.length; index++) {
            if (index > 0) summary.append(index == presets.length - 1 ? " or " : ", ");
            summary.append(presets[index]);
        }
        return summary.length() == 0 ? "" : summary.append(" min").toString();
    }

    /** One shade line of context: when the task is due and how important it is. */
    private static String subTextFor(Task task) {
        String due = dueSummaryFor(task);
        String priority = task.priority == null || task.priority.trim().isEmpty()
                ? "" : task.priority + " priority";
        if (due.isEmpty()) return priority;
        return priority.isEmpty() ? due : due + " · " + priority;
    }

    /** "Due today", "Overdue Nov 3" or "Due Nov 5", plus the due time when the task has one. */
    private static String dueSummaryFor(Task task) {
        if (task.dueDate == null) return "";
        LocalDate due;
        try {
            due = LocalDate.parse(task.dueDate);
        } catch (RuntimeException malformedDate) {
            return "";
        }
        LocalDate today = LocalDate.now();
        String day = due.isBefore(today) ? "Overdue " + TaskLogic.formatDate(due)
                : due.equals(today) ? "Due today" : "Due " + TaskLogic.formatDate(due);
        String time = TaskLogic.formatTime(task.dueTime);
        return time.isEmpty() ? day : day + " " + time;
    }

    /**
     * Locked-screen placeholder. A private notification without a public version is shown as an
     * empty row on the lock screen; this keeps that row readable without revealing task text.
     */
    private static Notification publicVersion(Context context) {
        return new Notification.Builder(context, TaskReminderScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("Task reminder")
                .setContentText("A Daymark task is due.")
                .setCategory(Notification.CATEGORY_REMINDER)
                .build();
    }

    /**
     * Posts one sample reminder so the user can confirm that reminders actually reach the shade
     * with their own sound and channel settings. It never touches a task or an alarm.
     */
    static boolean postTestNotification(Context context) {
        if (context == null) return false;
        if (!TaskReminderScheduler.notificationsAllowed(context)) return false;
        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return false;
        TaskReminderScheduler.ensureChannel(context);
        PendingIntent open = PendingIntent.getActivity(context, TEST_NOTIFICATION_ID,
                new Intent(context, MainActivity.class).setPackage(context.getPackageName()),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String snoozeChoices = snoozeChoicesSummary();
        Notification notification = new Notification.Builder(context, TaskReminderScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("Test reminder")
                .setContentText("This is how a Daymark reminder looks.")
                .setSubText("Notifications are working")
                .setStyle(new Notification.BigTextStyle()
                        .bigText("Notifications are working. A real reminder shows the task title, "
                                + "when it is due and how important it is, and offers "
                                + snoozeChoices + " snooze choices."))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion(context))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .build();
        try {
            notificationManager.notify(TEST_NOTIFICATION_ID, notification);
            return true;
        } catch (RuntimeException testFailure) {
            Log.w("DaymarkReminder", "Could not post the test reminder notification.", testFailure);
            return false;
        }
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
        int snoozeMinutes = snoozeMinutesForAction(intent == null ? null : intent.getAction());
        if (notificationId <= 0 || taskId == null || baseFire == null || snoozeMinutes <= 0) {
            Log.w("DaymarkReminder", "A snooze action arrived without a task occurrence; nothing was scheduled.");
            return;
        }

        // Snooze is an action on a posted notification, not a trusted alarm. Re-read the
        // current task and verify both the base occurrence and canonical notification ID.
        Task currentTask = findValidReminderTask(context, taskId, baseFire);
        Integer expectedId = TaskReminderScheduler.getNotificationId(context, taskId);
        if (currentTask == null || expectedId == null || expectedId != notificationId) {
            Log.i("DaymarkReminder", "Stale snooze action ignored for task " + taskId);
            return;
        }

        if (TaskReminderScheduler.snooze(context, notificationId, currentTask, baseFire, snoozeMinutes)) {
            cancelNotification(context, notificationId);
        }
    }

    private void cancelNotification(Context context, int notificationId) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        try {
            manager.cancel(notificationId);
        } catch (RuntimeException cancelFailure) {
            Log.w("DaymarkReminder", "Could not cancel reminder notification " + notificationId,
                    cancelFailure);
        }
    }

    private void rescheduleAfterSystemChange(Context context) {
        try {
            EncryptedTaskStore store = new EncryptedTaskStore(context);
            List<Task> tasks = store.load();
            TaskReminderScheduler.rescheduleAll(context, tasks);
            context.getSharedPreferences(TaskReminderScheduler.REMINDER_PREFERENCES, Context.MODE_PRIVATE)
                    .edit().remove(TaskReminderScheduler.BOOT_RESCHEDULE_FAILED_KEY).apply();
        } catch (Exception reminderRescheduleFailed) {
            Log.w("DaymarkReminder", "System-time reschedule failed; alarms retry on the next app open.",
                    reminderRescheduleFailed);
            context.getSharedPreferences(TaskReminderScheduler.REMINDER_PREFERENCES, Context.MODE_PRIVATE)
                    .edit().putBoolean(TaskReminderScheduler.BOOT_RESCHEDULE_FAILED_KEY, true).apply();
        }
    }
}
