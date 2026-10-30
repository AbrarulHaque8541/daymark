#!/usr/bin/env python3
"""Guard at-least-once in-app reminder presentation across Activity lifecycle failures."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
method = activity.split("private void checkDueReminders()", 1)[1].split(
    "private void showTaskActions", 1
)[0]
assert "reminderDialog.setOnShowListener" in method, "shown marker must be deferred until the dialog is visible"
listener = method.split("reminderDialog.setOnShowListener", 1)[1].split("try {", 1)[0]
assert "replaceTask(current.withReminderShown" in listener, "only a shown reminder may be marked as shown"
assert "if (changed) saveTasksAsync()" in listener, "shown state must be persisted after display"
assert "replaceTask(task.withReminderShown" not in method, "do not consume reminders before attempting display"
assert "reminderDialog.show()" in method, "the due reminder dialog must still be displayed"
assert "Reminder could not be shown. It will be retried the next time you open Daymark." in method, \
    "failed presentation must tell the user the reminder remains eligible for retry"
assert "TaskLogic.reminderFireInstant(current, zone)" in listener, "re-check current task state before marking shown"
assert "rescheduleTaskReminders();" in method, "opening the app must reschedule OS notification alarms"
assert "advanceRepeatingTasksWithoutReminders();" in method, "passive repeating tasks must roll forward without a reminder dialog"
assert "TaskLogic.advanceRepeat(current, zone, shownAt)" in listener, "a shown repeating reminder must advance to the next occurrence"
assert "TaskReminderScheduler.rescheduleAll(this, tasks);" in activity, "OS alarms must be rescheduled from the activity after task changes"
assert "TaskReminderScheduler.requestNotificationPermissionIfNeeded(MainActivity.this);" in activity, "notification permission must be requested only when a reminder is enabled"

# Snooze must only re-arm the existing alarm slot; touching the encrypted store from the
# receiver would race the open activity's snapshot writes.
receiver = (root / "app/src/main/java/com/abrar/daymark/TaskReminderReceiver.java").read_text(encoding="utf-8")
scheduler = (root / "app/src/main/java/com/abrar/daymark/TaskReminderScheduler.java").read_text(encoding="utf-8")
assert 'static final String ACTION_SNOOZE = "daymark.action.snooze_reminder";' in receiver, \
    "the snooze action needs a stable name"
assert "if (ACTION_SNOOZE.equals(action)) {" in receiver, "the receiver must branch on the snooze action"
assert 'static final String ACTION_DISMISS = "daymark.action.dismiss_reminder";' in receiver, "the dismiss action needs a stable name"
assert "if (ACTION_DISMISS.equals(action)) {" in receiver, "the receiver must branch on the dismiss action"
assert ".setAction(ACTION_DISMISS)" in receiver, "the dismiss PendingIntent must carry the dismiss action"
assert '"Dismiss", dismiss' in receiver, "the expanded reminder must expose a dismiss quick action"
assert "new Notification.BigTextStyle()" in receiver, "the reminder must provide expanded notification content"
dismiss_method = receiver.split("private void dismissReminder", 1)[1].split("private void snoozeReminder", 1)[0]
assert "notificationManager.cancel(notificationId);" in dismiss_method, "dismiss must clear only the visible notification"
assert "EncryptedTaskStore" not in dismiss_method and "TaskReminderScheduler" not in dismiss_method, "dismiss must not mutate task data or reminder schedules"
assert ".setAction(ACTION_SNOOZE)" in receiver, "the snooze PendingIntent must carry the snooze action"
assert '"Snooze " + TaskReminderScheduler.SNOOZE_MINUTES + " min"' in receiver, \
    "the notification must offer the snooze action"
assert "PendingIntent.FLAG_IMMUTABLE" in receiver, "notification PendingIntents must be immutable"
assert "static final int SNOOZE_MINUTES = 10;" in scheduler, "snooze delay must be ten minutes"
assert "alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt," in scheduler, \
    "snooze must use the same inexact alarm API as reminders, not exact alarms"
snooze_method = receiver.split("private void snoozeReminder", 1)[1].split(
    "private void rescheduleAfterBoot", 1
)[0]
assert "notificationManager.cancel(notificationId);" in snooze_method, \
    "snoozing must clear the fired notification first"
assert "TaskReminderScheduler.snooze(context, notificationId, taskId, title);" in snooze_method, \
    "snoozing must re-arm the alarm slot"
assert "EncryptedTaskStore" not in snooze_method, \
    "the snooze path must not write the task store from a BroadcastReceiver"
snooze_scheduler = scheduler.split("static void snooze(", 1)[1].split("static void rescheduleAll", 1)[0]
assert "PendingIntent.getBroadcast(context, requestCode, intent," in snooze_scheduler, \
    "snooze must reuse the task's request code so a later cancel or reschedule replaces it"
assert "PendingIntent.FLAG_UPDATE_CURRENT" in snooze_scheduler, \
    "snooze must replace the fired alarm instead of adding a second one"
print("PASS reminder lifecycle source checks: mark-after-show, revalidate task, persist only visible reminders, retry disclosure, reschedule OS alarms on app open, snooze re-arms only the alarm slot")
