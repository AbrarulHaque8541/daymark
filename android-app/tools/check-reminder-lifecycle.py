#!/usr/bin/env python3
"""Guard reminder delivery, snooze durability, notification reconciliation and instrumentation startup."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
instrumentation = (root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java").read_text(encoding="utf-8")
receiver = (root / "app/src/main/java/com/abrar/daymark/TaskReminderReceiver.java").read_text(encoding="utf-8")
scheduler = (root / "app/src/main/java/com/abrar/daymark/TaskReminderScheduler.java").read_text(encoding="utf-8")
policy = (root / "app/src/main/java/com/abrar/daymark/ReminderSchedulePolicy.java").read_text(encoding="utf-8")
manifest = (root / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
task_logic = (root / "app/src/main/java/com/abrar/daymark/TaskLogic.java").read_text(encoding="utf-8")
core_runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")

# The custom Instrumentation must explicitly start its worker thread from onCreate.
assert "public void onCreate(Bundle arguments)" in instrumentation
assert "super.onCreate(arguments);" in instrumentation
assert 'marker("instrumentation onCreate; dispatching start()");' in instrumentation
assert "start();" in instrumentation.split("public void onCreate(Bundle arguments)", 1)[1].split("public void onStart()", 1)[0]

# In-app reminder is consumed only after the dialog is actually visible.
method = activity.split("private void checkDueReminders()", 1)[1].split(
    "private void showTaskActions", 1
)[0]
assert "reminderDialog.setOnShowListener" in method
listener = method.split("reminderDialog.setOnShowListener", 1)[1].split("try {", 1)[0]
assert "replaceTask(current.withReminderShown" in listener
assert "if (changed) saveTasksAsync()" in listener
assert "replaceTask(task.withReminderShown" not in method
assert "reminderDialog.show()" in method
assert "Reminder could not be shown. It will be retried the next time you open Daymark." in method
assert "TaskLogic.reminderFireInstant(current, zone)" in listener
assert "rescheduleTaskReminders();" in method
assert "advanceRepeatingTasksWithoutReminders();" in method
assert "TaskLogic.advanceRepeat(current, zone, shownAt)" in listener
assert "TaskReminderScheduler.rescheduleAll(this, tasks);" in activity
assert "TaskReminderScheduler.requestNotificationPermissionIfNeeded(MainActivity.this);" in activity

# Boot and system clock/timezone changes must all re-arm the absolute RTC alarm schedule.
assert "ReminderSchedulePolicy.shouldRescheduleForSystemChange(action)" in receiver
assert "rescheduleAfterSystemChange(context)" in receiver
assert "private void rescheduleAfterSystemChange(Context context)" in receiver
receive_method = receiver.split("public void onReceive(Context context, Intent intent)", 1)[1].split(
    "private void showReminder", 1
)[0]
assert receive_method.index("rescheduleAfterSystemChange(context)") < receive_method.index("showReminder(context, intent)")
for action in (
    "android.intent.action.BOOT_COMPLETED",
    "android.intent.action.QUICKBOOT_POWERON",
    "android.intent.action.TIME_SET",
    "android.intent.action.TIMEZONE_CHANGED",
):
    assert action in policy and action in manifest, f"system reminder reschedule action is missing: {action}"
assert "The schedule is recomputed on task saves, app open, boot, and system clock/timezone" in scheduler

# Snooze is a durable override tied to one exact base occurrence, not a fire-time mismatch.
assert 'static final String ACTION_SNOOZE = "daymark.action.snooze_reminder";' in receiver
assert "static int snoozeMinutesForAction(String action)" in receiver
assert "if (snoozeMinutesForAction(action) > 0)" in receiver
assert "ReminderSchedulePolicy.snoozeMinutesForAction(" in receiver
assert "snoozeActionForMinutes(minutes)" in receiver
assert 'static final String ACTION_DISMISS = "daymark.action.dismiss_reminder";' in receiver
assert "if (ACTION_DISMISS.equals(action))" in receiver
assert 'new Notification.BigTextStyle()' in receiver
assert "Notification.VISIBILITY_PRIVATE" in receiver
assert "Notification.CATEGORY_REMINDER" in receiver
assert ".setDeleteIntent(dismiss)" in receiver
assert '"Dismiss", dismiss' not in receiver, "the three notification buttons are reserved for snooze choices"
assert "expectedId != notificationId" in receiver
assert "private void dismissReminder(Context context, Intent intent)" in receiver
assert "notificationManager.cancel(notificationId)" not in receiver.split("private void dismissReminder", 1)[1].split("private void snoozeReminder", 1)[0],     "dismiss must validate the task's canonical ID before clearing a notification"
assert '"Snooze " + minutes + " min"' in receiver
assert "for (int minutes : ReminderSchedulePolicy.snoozePresetsMinutes())" in receiver
assert "Swipe away to dismiss." in receiver
assert "PendingIntent.FLAG_IMMUTABLE" in receiver
assert "static final int[] REMINDER_LEADS = { 0, 30, 60, 1440 };" in task_logic
assert "static final int SNOOZE_MINUTES = 10;" in scheduler
assert "return snooze(context, notificationId, task, baseFireText, SNOOZE_MINUTES);" in scheduler
assert "!ReminderSchedulePolicy.isSupportedSnoozeMinutes(snoozeMinutes)" in scheduler
assert "ReminderSchedulePolicy.snoozeFire(Instant.now(), snoozeMinutes)" in scheduler
assert "ReminderSchedulePolicy.encodeSnooze(baseFireText, snoozeFire)" in scheduler
assert "preferences.edit().putString(key, record).commit()" in scheduler
assert "ReminderSchedulePolicy.scheduledFire(" in scheduler
assert "ReminderSchedulePolicy.acceptsFire(" in receiver
assert "ReminderSchedulePolicy.isSnoozedFire(" in receiver
assert "TaskReminderScheduler.snooze(context, notificationId, currentTask, baseFire, snoozeMinutes)" in receiver
show_method = receiver.split("private void showReminder", 1)[1].split(
    "private Task findValidReminderTask", 1
)[0]
assert "String title =" not in show_method, "alarm extras must not override or gate on the current encrypted task title"
assert "currentTask.title" in show_method
assert "putExtra(EXTRA_FIRE_INSTANT, fireInstant)" in receiver
snooze_method = receiver.split("private void snoozeReminder", 1)[1].split(
    "private void cancelNotification", 1
)[0]
assert "findValidReminderTask(context, taskId, baseFire)" in snooze_method
assert "TaskReminderScheduler.getNotificationId(context, taskId)" in snooze_method
assert "if (TaskReminderScheduler.snooze(context, notificationId, currentTask, baseFire, snoozeMinutes))" in snooze_method
stale_snooze = snooze_method.split("if (currentTask == null || expectedId == null || expectedId != notificationId)", 1)[1].split("TaskReminderScheduler.snooze(context", 1)[0]
assert "cancelNotification(" not in stale_snooze and "clearSnooze(" not in stale_snooze, \
    "a stale snooze action must not affect the current notification or snooze state"
assert "notificationManager.cancel(notificationId);" not in snooze_method,     "a visible notification must remain if its snooze alarm could not be persisted/armed"
assert "cancelNotification(context, notificationId);\n        }" in snooze_method, \
    "only a successfully persisted and armed snooze clears the current notification"
assert "TaskReminderScheduler.snooze(context, notificationId, currentTask, baseFire, snoozeMinutes)" in snooze_method

# One canonical request-code index owns both alarms and notification IDs; no mirrored index.
assert 'private static final String CODE_PREFERENCES = "daymark.reminder.codes.v1";' in scheduler
assert "NOTIFICATION_PREFERENCES" not in scheduler
assert "static Integer getNotificationId(Context context, String taskId)" in scheduler
assert "codes.getAll().get(taskId)" in scheduler
assert "private static Integer parsePositiveId(Object value)" in scheduler
assert "EXTRA_TASK_TITLE" not in receiver and "EXTRA_TASK_TITLE" not in scheduler, \
    "alarm PendingIntents must not carry a stale task title"
assert "private static void schedule(" not in scheduler, "there must be one canonical scheduling path"
assert "static String validSnoozeFire(" in policy
assert "static boolean acceptsFire(" in policy
assert "reconcileActiveNotifications(context, alarmManager, notificationManager, codes, known, liveTasks);" in scheduler
assert "manager.getActiveNotifications()" in scheduler
assert "baseFireText.equals(postedFire)" in scheduler
assert "cancelPostedNotification(manager, posted.getId())" in scheduler
assert "manager.cancel(notificationId)" in scheduler
assert "private static String readString(SharedPreferences preferences, String key)" in scheduler
assert "Discarding malformed reminder request-code counter." in scheduler
assert "Could not schedule reminder for task " in scheduler
assert "Could not cancel stale reminder alarm for task " in scheduler
assert "Could not publish reminder notification for task " in receiver
assert "cancelAlarm(context, alarmManager, taskId, posted.getId())" in scheduler
assert "known.put(taskId, String.valueOf(posted.getId()))" in scheduler,     "valid active notifications must recover a lost request-code index"
assert "TaskReminderReceiver.refreshPostedNotification(" in scheduler
assert "if (alarmManager == null)" in scheduler
assert "AlarmManager is unavailable; in-app reminder remains available." in scheduler
assert "private static final String SNOOZE_KEY_PREFIX = \"snooze.\";" in scheduler
assert "for (String key : reminderPreferences.getAll().keySet())" in scheduler
assert "liveTasks.containsKey(key.substring(SNOOZE_KEY_PREFIX.length()))" in scheduler
assert "valid active notification recovers a lost canonical ID index" in instrumentation

# Policy is independently compiled and executed in the canonical host test suite.
assert "ReminderSchedulePolicy.java" in core_runner
assert "alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeFire.toEpochMilli()," in scheduler
assert "setExact(" not in scheduler, "reminders must remain inexact and must not require exact-alarm access"
assert "ReminderSchedulePolicySmoke.java" in core_runner
assert "com.abrar.daymark.ReminderSchedulePolicySmoke" in core_runner
assert "postTestReminder(manager, context, notificationId, task, fire.toString())" in instrumentation
assert "fire != null && !fire.isAfter(java.time.Instant.now())" in instrumentation, "snooze fixture must represent a reminder whose base occurrence has fired"
assert "manager.areNotificationsEnabled()" in instrumentation
assert "reminderChannel.getImportance() != android.app.NotificationManager.IMPORTANCE_NONE" in instrumentation
assert "awaitNotificationState(manager, notificationId, true)" in instrumentation
assert "awaitNotificationTitle(" in instrumentation
assert "cmd appops set com.abrar.daymark POST_NOTIFICATION allow" in (root / "tools/run-reminder-lifecycle-instrumentation.sh").read_text(encoding="utf-8")
assert "dumpsys notification --noredact" in (root / "tools/run-reminder-lifecycle-instrumentation.sh").read_text(encoding="utf-8")
assert "valid active notification recovers a lost canonical ID index" in instrumentation
assert "TaskReminderScheduler.snooze(context, notificationId, renamed, fire.toString())" in instrumentation
assert "app rescheduling preserves a valid snooze instead of overwriting it" in instrumentation
assert "due-date edit invalidates the previous occurrence's snooze" in instrumentation
assert "deleted task even when its ID index is missing" in instrumentation
assert "deleted-task notification is active before its ID index is lost" in instrumentation
assert "orphan notification is active before AlarmManager-less reconciliation" in instrumentation
assert "Dismiss action removes only the visible reminder notification" in instrumentation
assert "Dismiss leaves the task's canonical reminder identity intact" in instrumentation
assert "edited-task notification is active before completion reconciliation" in instrumentation
assert "malformed request-code preference is repaired without aborting other reminders" in instrumentation
assert "wrong-typed snooze preference is discarded without aborting reconciliation" in instrumentation
assert "wrong-typed request-code counter is reset and a fresh ID is allocated" in instrumentation
assert "notification reconciliation still runs when AlarmManager is unavailable" in instrumentation

print("PASS reminder lifecycle guards: visible-only consumption, runner startup, canonical IDs, stale-notification recovery, durable occurrence-bound snooze and host regression coverage")
