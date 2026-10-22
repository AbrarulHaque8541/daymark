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

# Guard stale posted notification cleanup in scheduler
scheduler = (root / "app/src/main/java/com/abrar/daymark/TaskReminderScheduler.java").read_text(encoding="utf-8")
assert "NOTIFICATION_PREFERENCES" in scheduler, "scheduler must track notification IDs"
assert "cancelNotification(context, notificationManager, taskId, requestCode)" in scheduler, "scheduler must cancel notifications for deleted/completed tasks"
assert "notificationManager.cancel(requestCode)" in scheduler, "scheduler must call NotificationManager.cancel"
assert "notifications.edit().remove(taskId).apply()" in scheduler, "scheduler must clean up notification tracking on cancel"
assert "SharedPreferences notifications = context.getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE)" in scheduler, "scheduler must load notification preferences"

# Guard receiver validation of stale intents
receiver = (root / "app/src/main/java/com/abrar/daymark/TaskReminderReceiver.java").read_text(encoding="utf-8")
assert "String taskId = intent == null ? null : intent.getStringExtra(EXTRA_TASK_ID);" in receiver, "receiver must extract task ID from intent"
assert "String fireInstant = intent == null ? null : intent.getStringExtra(EXTRA_FIRE_INSTANT);" in receiver, "receiver must extract fire instant from intent"
assert "if (notificationId == 0 || taskId == null || title == null || title.trim().isEmpty() || fireInstant == null)" in receiver, "receiver must validate all required extras"
assert "isReminderStillValid(context, taskId, fireInstant)" in receiver, "receiver must validate reminder is still valid"
assert "getCurrentTaskTitle(context, taskId)" in receiver, "receiver must fetch current task title"
assert "EncryptedTaskStore store = new EncryptedTaskStore(context);" in receiver, "receiver must load tasks to validate"
assert "if (task.completed)" in receiver, "receiver must reject completed tasks"
assert "if (task.reminderLeadMinutes == null || task.dueDate == null)" in receiver, "receiver must reject tasks without reminder"
assert "if (fireInstant.equals(task.reminderShownFire))" in receiver, "receiver must reject already-shown reminders"
assert "Instant.parse(fireInstant)" in receiver, "receiver must parse fire instant for validation"
assert "TaskLogic.reminderFireInstant(task, java.time.ZoneId.systemDefault())" in receiver, "receiver must re-compute expected fire instant"

print("PASS reminder lifecycle source checks: mark-after-show, revalidate task, persist only visible reminders, retry disclosure, reschedule OS alarms on app open, stale notification cleanup, receiver validation")
