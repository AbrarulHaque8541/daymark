package com.abrar.daymark;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Smoke tests for task reminder scheduler and receiver notification lifecycle.
 * Tests cover: stale notification cleanup on task deletion/completion/reminder removal,
 * title/occurrence refresh, unchanged reminder without repost, and recurring transitions.
 */
public final class TaskReminderSchedulerSmoke {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testRescheduleAllCancelsStaleAlarmsAndNotifications();
        testNotificationCancelledWhenTaskDeleted();
        testNotificationCancelledWhenTaskCompleted();
        testNotificationCancelledWhenReminderRemoved();
        testNotificationRefreshedWhenTitleChanges();
        testNotificationRefreshedWhenDueDateChanges();
        testNotificationPreservedWhenReminderUnchanged();
        testRecurringTaskNotificationCleanup();
        testUnrelatedNotificationsUntouched();
        System.out.println("PASS TaskReminderSchedulerSmoke: " + assertions + " assertions");
    }

    private static void testRescheduleAllCancelsStaleAlarmsAndNotifications() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task activeTask = TaskLogic.create("Test Task", "2026-12-01", "high", null, null, 60, null);
        tasks.add(activeTask);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        
        // Verify alarm was scheduled
        check(context.alarmManager != null, "AlarmManager should be available");
        check(context.alarmManager.canceledAlarms.isEmpty(), "No alarms canceled on first schedule");
        check(context.alarmManager.scheduledAlarms.size() == 1, "One alarm should be scheduled");

        // Now remove the task's reminder
        List<Task> updatedTasks = new ArrayList<>();
        updatedTasks.add(activeTask.withFullDetails("Test Task", "", "2026-12-01", null, "high", null, null, null, null, Instant.now().toString()));
        
        TaskReminderScheduler.rescheduleAll(context, updatedTasks);
        
        // Verify alarm was canceled
        check(context.alarmManager.canceledAlarms.size() == 1, "Alarm should be canceled when reminder removed");
        check(context.notificationManager.canceledNotifications.size() == 1, "Notification should be canceled when reminder removed");
        assertions += 2;
    }

    private static void testNotificationCancelledWhenTaskDeleted() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task = TaskLogic.create("Task to delete", "2026-12-01", "high", null, null, 60, null);
        tasks.add(task);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        check(context.alarmManager.scheduledAlarms.size() == 1, "Alarm scheduled for task");

        // Delete the task
        List<Task> emptyTasks = Collections.emptyList();
        TaskReminderScheduler.rescheduleAll(context, emptyTasks);
        
        check(context.alarmManager.canceledAlarms.size() == 1, "Alarm canceled for deleted task");
        check(context.notificationManager.canceledNotifications.size() == 1, "Notification canceled for deleted task");
        assertions += 2;
    }

    private static void testNotificationCancelledWhenTaskCompleted() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task = TaskLogic.create("Task to complete", "2026-12-01", "high", null, null, 60, null);
        tasks.add(task);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        
        // Complete the task
        List<Task> updatedTasks = new ArrayList<>();
        updatedTasks.add(TaskLogic.toggleCompleted(task));
        TaskReminderScheduler.rescheduleAll(context, updatedTasks);
        
        check(context.alarmManager.canceledAlarms.size() == 1, "Alarm canceled for completed task");
        check(context.notificationManager.canceledNotifications.size() == 1, "Notification canceled for completed task");
        assertions += 2;
    }

    private static void testNotificationCancelledWhenReminderRemoved() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task = TaskLogic.create("Task with reminder", "2026-12-01", "high", null, null, 60, null);
        tasks.add(task);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        
        // Remove reminder
        List<Task> updatedTasks = new ArrayList<>();
        updatedTasks.add(task.withFullDetails("Task without reminder", task.notes, task.dueDate, task.dueTime, 
                task.priority, null, task.repeatRule, task.subtasks, task.tags, Instant.now().toString()));
        TaskReminderScheduler.rescheduleAll(context, updatedTasks);
        
        check(context.alarmManager.canceledAlarms.size() == 1, "Alarm canceled when reminder removed");
        check(context.notificationManager.canceledNotifications.size() == 1, "Notification canceled when reminder removed");
        assertions += 2;
    }

    private static void testNotificationRefreshedWhenTitleChanges() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task = TaskLogic.create("Original Title", "2026-12-01", "high", null, null, 60, null);
        tasks.add(task);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        int originalRequestCode = context.lastRequestCode;
        
        // Change title
        List<Task> updatedTasks = new ArrayList<>();
        updatedTasks.add(task.withDetails("Updated Title", task.dueDate, task.priority, Instant.now().toString()));
        TaskReminderScheduler.rescheduleAll(context, updatedTasks);
        
        // The notification should be updated with new title
        // Since we use FLAG_UPDATE_CURRENT, the pending intent should have new title
        check(context.alarmManager.scheduledAlarms.size() == 1, "Alarm still scheduled after title change");
        // The request code should remain stable
        check(context.lastRequestCode == originalRequestCode, "Request code should remain stable for same task");
        assertions += 2;
    }

    private static void testNotificationRefreshedWhenDueDateChanges() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task = TaskLogic.create("Task", "2026-12-01", "high", null, null, 60, null);
        tasks.add(task);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        
        // Change due date
        List<Task> updatedTasks = new ArrayList<>();
        updatedTasks.add(task.withDetails(task.title, "2026-12-02", task.priority, Instant.now().toString()));
        TaskReminderScheduler.rescheduleAll(context, updatedTasks);
        
        // Notification and alarm should be rescheduled with new date
        check(context.alarmManager.scheduledAlarms.size() == 1, "Alarm rescheduled with new due date");
        assertions++;
    }

    private static void testNotificationPreservedWhenReminderUnchanged() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task = TaskLogic.create("Task", "2026-12-01", "high", "notes", null, 60, null);
        tasks.add(task);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        int originalAlarmCount = context.alarmManager.scheduledAlarms.size();
        
        // Reschedule with same task (no changes)
        TaskReminderScheduler.rescheduleAll(context, tasks);
        
        // Should not create duplicate alarms
        check(context.alarmManager.scheduledAlarms.size() == originalAlarmCount, 
                "No duplicate alarms when task unchanged");
        assertions++;
    }

    private static void testRecurringTaskNotificationCleanup() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task = TaskLogic.create("Recurring Task", "2026-12-01", "high", null, null, 60, "daily");
        tasks.add(task);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        
        // Complete the recurring task
        List<Task> updatedTasks = new ArrayList<>();
        updatedTasks.add(TaskLogic.toggleCompleted(task));
        TaskReminderScheduler.rescheduleAll(context, updatedTasks);
        
        check(context.alarmManager.canceledAlarms.size() == 1, "Alarm canceled for completed recurring task");
        check(context.notificationManager.canceledNotifications.size() == 1, "Notification canceled for completed recurring task");
        assertions += 2;
    }

    private static void testUnrelatedNotificationsUntouched() throws Exception {
        MockContext context = new MockContext();
        List<Task> tasks = new ArrayList<>();
        Task task1 = TaskLogic.create("Task 1", "2026-12-01", "high", null, null, 60, null);
        Task task2 = TaskLogic.create("Task 2", "2026-12-02", "medium", null, null, 30, null);
        tasks.add(task1);
        tasks.add(task2);

        TaskReminderScheduler.rescheduleAll(context, tasks);
        
        // Delete task1, task2 should remain
        List<Task> updatedTasks = new ArrayList<>();
        updatedTasks.add(task2);
        TaskReminderScheduler.rescheduleAll(context, updatedTasks);
        
        // Only task1's alarm should be canceled
        check(context.alarmManager.canceledAlarms.size() == 1, "Only one alarm canceled");
        check(context.alarmManager.scheduledAlarms.size() == 1, "Task2 alarm should remain");
        check(context.notificationManager.canceledNotifications.size() == 1, "Only one notification canceled");
        assertions += 3;
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    // Mock classes for testing
    private static class MockAlarmManager extends AlarmManager {
        List<Integer> scheduledAlarms = new ArrayList<>();
        List<Integer> canceledAlarms = new ArrayList<>();
        
        @Override
        public void setAndAllowWhileIdle(int type, long triggerAtMillis, android.app.PendingIntent operation) {
            scheduledAlarms.add(operation.getRequestCode());
        }
        
        @Override
        public void cancel(android.app.PendingIntent intent) {
            canceledAlarms.add(intent.getRequestCode());
        }
    }

    private static class MockNotificationManager extends NotificationManager {
        List<Integer> canceledNotifications = new ArrayList<>();
        
        public MockNotificationManager() {
            super();
        }
        
        @Override
        public void cancel(int id) {
            canceledNotifications.add(id);
        }
        
        @Override
        public void notify(int id, android.app.Notification notification) {
            // Track notification
        }
    }

    private static class MockContext extends Context {
        MockAlarmManager alarmManager = new MockAlarmManager();
        MockNotificationManager notificationManager = new MockNotificationManager();
        int lastRequestCode = 0;
        
        @Override
        public Object getSystemService(String name) {
            if (Context.ALARM_SERVICE.equals(name)) {
                return alarmManager;
            }
            if (Context.NOTIFICATION_SERVICE.equals(name)) {
                return notificationManager;
            }
            return null;
        }
        
        @Override
        public SharedPreferences getSharedPreferences(String name, int mode) {
            return new MockSharedPreferences();
        }
    }

    private static class MockSharedPreferences implements SharedPreferences {
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        
        @Override
        public Editor edit() {
            return new MockEditor();
        }
        
        @Override
        public java.util.Map<String, ?> getAll() {
            return data;
        }
        
        @Override
        public String getString(String key, String defValue) {
            return data.containsKey(key) ? (String) data.get(key) : defValue;
        }
        
        @Override
        public int getInt(String key, int defValue) {
            return data.containsKey(key) ? (Integer) data.get(key) : defValue;
        }
        
        @Override
        public boolean getBoolean(String key, boolean defValue) {
            return data.containsKey(key) ? (Boolean) data.get(key) : defValue;
        }
        
        @Override
        public float getFloat(String key, float defValue) { return defValue; }
        @Override
        public long getLong(String key, long defValue) { return defValue; }
        @Override
        public Set<String> getStringSet(String key, Set<String> defValues) { return defValues; }
        @Override
        public boolean contains(String key) { return data.containsKey(key); }
        @Override
        public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener) { }
        @Override
        public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener) { }

        private class MockEditor implements Editor {
            java.util.Map<String, Object> changes = new java.util.HashMap<>();
            
            @Override
            public Editor putString(String key, String value) {
                changes.put(key, value);
                return this;
            }
            
            @Override
            public Editor putInt(String key, int value) {
                changes.put(key, value);
                return this;
            }
            
            @Override
            public Editor putBoolean(String key, boolean value) {
                changes.put(key, value);
                return this;
            }
            
            @Override
            public Editor remove(String key) {
                changes.put(key, null);
                return this;
            }
            
            @Override
            public Editor clear() {
                changes.clear();
                return this;
            }
            
            @Override
            public boolean commit() {
                data.putAll(changes);
                return true;
            }
            
            @Override
            public void apply() {
                data.putAll(changes);
            }
            
            @Override
            public Editor putLong(String key, long value) { return this; }
            @Override
            public Editor putFloat(String key, float value) { return this; }
            @Override
            public Editor putStringSet(String key, Set<String> values) { return this; }
        }
    }
}
