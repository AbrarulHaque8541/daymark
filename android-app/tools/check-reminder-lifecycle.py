#!/usr/bin/env python3
"""Guard at-least-once in-app reminder presentation across Activity lifecycle failures.
Also guard stale posted notification cleanup and receiver validation."""
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
# Guard stale posted notification cleanup in scheduler
scheduler = (root / "app/src/main/java/com/abrar/daymark/TaskReminderScheduler.java").read_text(encoding="utf-8")
assert "NOTIFICATION_PREFERENCES" in scheduler, "scheduler must track notification IDs"
assert "cancelNotification(context, notificationManager, taskId, notificationId)" in scheduler, "scheduler must cancel notifications using the independently tracked notification ID"
assert "notificationManager.cancel(requestCode)" in scheduler, "scheduler must call NotificationManager.cancel"
assert "notifications.edit().remove(taskId).apply()" in scheduler, "scheduler must clean up notification tracking on cancel"
assert "for (Map.Entry<String, ?> entry : knownNotifications.entrySet())" in scheduler, "scheduler must independently clean orphaned notification records even when the alarm-code index is missing"
assert "Object storedNotificationId = knownNotifications.get(task.id);" in scheduler, "scheduler must clean notifications when a task no longer needs reminders even if its alarm-code index is missing"
assert "storedNotificationId != null && (assigned == null" in scheduler, "scheduler must cancel an old notification before replacing a missing or mismatched alarm-code index"
assert "SharedPreferences notifications = context.getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE)" in scheduler, "scheduler must load notification preferences"

# Guard receiver validation of stale intents
receiver = (root / "app/src/main/java/com/abrar/daymark/TaskReminderReceiver.java").read_text(encoding="utf-8")
assert "String taskId = intent == null ? null : intent.getStringExtra(EXTRA_TASK_ID);" in receiver, "receiver must extract task ID from intent"
assert "String fireInstant = intent == null ? null : intent.getStringExtra(EXTRA_FIRE_INSTANT);" in receiver, "receiver must extract fire instant from intent"
assert "if (notificationId == 0 || taskId == null || title == null || title.trim().isEmpty() || fireInstant == null)" in receiver, "receiver must validate all required extras"
assert "findValidReminderTask(context, taskId, fireInstant)" in receiver, "receiver must validate and load the current task in one read"
assert "Task currentTask = findValidReminderTask(context, taskId, fireInstant);" in receiver, "receiver must fail closed if current state cannot be verified"
assert "refreshPostedNotification(context, notificationId, currentTask, fireInstant)" in receiver, "receiver must post current task title and lifecycle metadata"
assert "setOnlyAlertOnce(true)" in receiver, "metadata-only notification refresh must not re-alert"
assert "EncryptedTaskStore store = new EncryptedTaskStore(context);" in receiver, "receiver must load tasks to validate"
assert "if (task.completed || task.reminderLeadMinutes == null || task.dueDate == null)" in receiver, "receiver must reject completed tasks and tasks without reminders"
assert "if (fireInstant.equals(task.reminderShownFire))" in receiver, "receiver must reject already-shown reminders"
assert "Instant.parse(fireInstant)" in receiver, "receiver must parse fire instant for validation"
assert "TaskLogic.reminderFireInstant(task, java.time.ZoneId.systemDefault())" in receiver, "receiver must re-compute expected fire instant"

# Guard reconciliation of already-posted OS notifications on every task reschedule
assert "reconcilePostedNotification(context, notificationManager, notifications, task)" in scheduler, "scheduler must reconcile posted notifications before scheduling"
assert "notificationManager.getActiveNotifications()" in scheduler, "scheduler must inspect active notifications"
assert "!currentFireText.equals(postedFire)" in scheduler, "changed due occurrence must invalidate old notification"
assert "currentFireText.equals(task.reminderShownFire)" in scheduler, "scheduler must cancel the OS notification once the in-app reminder is marked shown"
assert 'notifications.edit().remove(task.id).apply();' in scheduler, "scheduler must remove the notification tracking record after canceling a stale posted notification"
assert "TaskReminderReceiver.refreshPostedNotification(context, notificationId, task, currentFireText)" in scheduler, "title-only edits must refresh existing notification"

print("PASS reminder lifecycle source checks: mark-after-show, revalidate task, persist only visible reminders, retry disclosure, reschedule OS alarms on app open, snooze re-arms only the alarm slot, stale notification cleanup, receiver validation")
