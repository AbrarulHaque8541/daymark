package com.abrar.daymark;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.SecretKey;
import javax.crypto.KeyGenerator;
import javax.crypto.spec.SecretKeySpec;

/** Platform-only instrumentation; intentionally uses no JUnit/AndroidX test dependency. */
public final class DaymarkPlatformInstrumentation extends Instrumentation {
    private static final String TASK_ID = "instrumentation-task-v1";
    private static final String LOG_TAG = "DaymarkInstr";
    private int assertions;

    @Override
    public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        marker("instrumentation onCreate; dispatching start()");
        start();
    }

    @Override
    public void onStart() {
        Bundle result = new Bundle();
        try {
            marker("instrumentation starting on SDK " + android.os.Build.VERSION.SDK_INT);
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                getUiAutomation().grantRuntimePermission(
                        getTargetContext().getPackageName(),
                        android.Manifest.permission.POST_NOTIFICATIONS);
                check(getTargetContext().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                                == android.content.pm.PackageManager.PERMISSION_GRANTED,
                        "platform instrumentation grants POST_NOTIFICATIONS before notification phases");
            }
            runPhase("import-legacy-snapshot", this::importLegacySnapshotRoundTripAndRollback);
            runPhase("offline-web-clip-store", this::offlineWebClipStoreRoundTrip);
            runPhase("connections-panel-accessibility", this::connectionsPanelAccessibility);
            runPhase("attachment-provider-pipe", this::attachmentProviderPipeAndAndroidCrypto);
            runPhase("portable-import-uri-journal", this::portableImportUriJournalPreservesRecreationAndCleansOrphans);
            runPhase("portable-backup-rekey", this::portableBackupRekeysAndReconcilesProcessDeath);
            runPhase("reminder-notification-lifecycle", this::reminderNotificationLifecycleUsesCurrentTaskState);
            // Exercise the real Android Keystore, AtomicFile and NotificationManager on API 29 and 36 emulators.
            runPhase("focus-timer-keystore-notification-lifecycle", this::focusTimerKeystoreAndNotificationLifecycle);
            marker("all phases passed; " + assertions + " assertions");
            result.putString("result", "passed");
            result.putInt("assertions", assertions);
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            android.util.Log.e(LOG_TAG, "instrumentation failed after " + assertions + " assertions", failure);
            marker("instrumentation failed after " + assertions + " assertions: " + failure);
            result.putString("result", "failed");
            result.putInt("assertions", assertions);
            result.putString("failure", stackTrace(failure));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    /** Logs a progress marker before and after each phase so CI can localize any hang. */
    private void runPhase(String name, PhaseAction action) throws Exception {
        marker("PHASE " + name + ": start");
        action.run();
        marker("PHASE " + name + ": ok (" + assertions + " assertions so far)");
    }

    /**
     * Markers go to logcat and to an app-local file; verbose CI boot logging rotates logcat
     * quickly, and the file survives rotation and is readable through run-as on a debug build.
     */
    private void marker(String message) {
        android.util.Log.i(LOG_TAG, message);
        try {
            File log = new File(getTargetContext().getFilesDir(), "instrumentation-phases.log");
            try (FileOutputStream out = new FileOutputStream(log, true)) {
                out.write((System.currentTimeMillis() + " " + message + "\n")
                        .getBytes(StandardCharsets.UTF_8));
            }
        } catch (Throwable suppressed) { }
    }

    @FunctionalInterface
    private interface PhaseAction {
        void run() throws Exception;
    }

    private void reminderNotificationLifecycleUsesCurrentTaskState() throws Exception {
        Context context = getTargetContext();
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            check(context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED,
                    "notification lifecycle test requires POST_NOTIFICATIONS grant");
        }
        android.app.NotificationManager manager =
                (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        check(manager != null, "NotificationManager is available");
        Task scheduledTask = TaskLogic.create("Reminder original", "2099-12-01", "high",
                null, null, 60, null);
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(scheduledTask));
        Integer allocatedId = TaskReminderScheduler.getNotificationId(context, scheduledTask.id);
        check(allocatedId != null && allocatedId > 0,
                "scheduler allocates a canonical request code for a future reminder");

        // Simulate the notification after its base alarm has fired. A real snooze timestamp
        // is now+10m, so the base occurrence must be at or before now.
        Task task = scheduledTask.withDetails(scheduledTask.title, "2026-10-29",
                scheduledTask.priority, java.time.Instant.now().toString());
        java.time.ZoneId zone = java.time.ZoneId.systemDefault();
        java.time.Instant fire = ReminderSchedulePolicy.baseFire(task, zone);
        check(fire != null && !fire.isAfter(java.time.Instant.now()),
                "simulated posted reminder represents an already-fired base occurrence");
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(task));
        Integer notificationId = TaskReminderScheduler.getNotificationId(context, task.id);
        check(notificationId != null && notificationId.equals(allocatedId),
                "fired reminder retains its canonical request code");

        TaskReminderScheduler.ensureChannel(context);
        check(manager.areNotificationsEnabled(),
                "app-level notifications are enabled on the scratch emulator");
        android.app.NotificationChannel reminderChannel =
                manager.getNotificationChannel(TaskReminderScheduler.CHANNEL_ID);
        check(reminderChannel != null
                        && reminderChannel.getImportance() != android.app.NotificationManager.IMPORTANCE_NONE,
                "reminder notification channel exists and is enabled");
        postTestReminder(manager, context, notificationId, task, fire.toString());
        check(awaitNotificationState(manager, notificationId, true),
                "synthetic reminder notification becomes active before reconciliation");

        Task renamed = task.withDetails("Reminder updated", task.dueDate, task.priority,
                java.time.Instant.now().toString());
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(renamed));
        android.app.Notification refreshed = awaitNotificationTitle(
                manager, notificationId, renamed.title);
        check(refreshed != null && renamed.title.equals(
                        refreshed.extras.getString(android.app.Notification.EXTRA_TITLE)),
                "title-only task edit refreshes the active reminder notification");

        // Simulate a process interruption between notification posting and preference commit.
        context.getSharedPreferences("daymark.reminder.codes.v1", Context.MODE_PRIVATE)
                .edit().remove(task.id).commit();
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(renamed));
        check(notificationId.equals(TaskReminderScheduler.getNotificationId(context, task.id)),
                "valid active notification recovers a lost canonical ID index");
        check(awaitNotificationState(manager, notificationId, true),
                "index recovery preserves the matching active notification");

        android.content.Intent dismissIntent = new android.content.Intent(
                context, TaskReminderReceiver.class)
                .setAction(TaskReminderReceiver.ACTION_DISMISS)
                .putExtra(TaskReminderReceiver.EXTRA_NOTIFICATION_ID, notificationId)
                .putExtra(TaskReminderReceiver.EXTRA_TASK_ID, renamed.id);
        new TaskReminderReceiver().onReceive(context, dismissIntent);
        check(awaitNotificationState(manager, notificationId, false),
                "Dismiss action removes only the visible reminder notification");
        check(notificationId.equals(TaskReminderScheduler.getNotificationId(context, renamed.id)),
                "Dismiss leaves the task's canonical reminder identity intact");
        postTestReminder(manager, context, notificationId, renamed, fire.toString());
        check(awaitNotificationState(manager, notificationId, true),
                "notification can be posted again after Dismiss without changing the task");

        check(TaskReminderScheduler.snooze(context, notificationId, renamed, fire.toString()),
                "current notification can persist and arm a snooze");
        String snoozeRecord = TaskReminderScheduler.snoozeRecord(context, task.id);
        String snoozeFire = ReminderSchedulePolicy.validSnoozeFire(snoozeRecord, fire.toString());
        check(snoozeFire != null, "snooze fire time is persisted against its base occurrence");
        check(ReminderSchedulePolicy.acceptsFire(renamed, zone, snoozeFire, snoozeRecord),
                "receiver policy accepts the persisted snooze occurrence");
        manager.cancel(notificationId);
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(renamed));
        check(snoozeRecord.equals(TaskReminderScheduler.snoozeRecord(context, task.id)),
                "app rescheduling preserves a valid snooze instead of overwriting it");

        Task moved = renamed.withDetails(renamed.title, "2099-12-02", renamed.priority,
                java.time.Instant.now().toString());
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(moved));
        check(TaskReminderScheduler.snoozeRecord(context, task.id) == null,
                "due-date edit invalidates the previous occurrence's snooze");
        check(awaitNotificationState(manager, notificationId, false),
                "old occurrence notification is removed after due-date edit");

        java.time.Instant movedFire = ReminderSchedulePolicy.baseFire(moved, zone);
        check(movedFire != null, "edited reminder has a new occurrence");
        postTestReminder(manager, context, notificationId, moved, movedFire.toString());
        check(awaitNotificationState(manager, notificationId, true),
                "edited-task notification is active before completion reconciliation");
        Task completed = TaskLogic.toggleCompleted(moved);
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(completed));
        check(awaitNotificationState(manager, notificationId, false),
                "notification is canceled when its task is completed");
        check(TaskReminderScheduler.getNotificationId(context, task.id) == null,
                "completed task releases its canonical reminder ID");

        Task deleted = TaskLogic.create("Reminder deleted", "2099-12-03", "high",
                null, null, 60, null);
        java.time.Instant deletedFire = ReminderSchedulePolicy.baseFire(deleted, zone);
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(deleted));
        Integer deletedId = TaskReminderScheduler.getNotificationId(context, deleted.id);
        check(deletedId != null, "deleted-task fixture has a scheduled reminder ID");
        postTestReminder(manager, context, deletedId, deleted, deletedFire.toString());
        check(awaitNotificationState(manager, deletedId, true),
                "deleted-task notification is active before its ID index is lost");
        context.getSharedPreferences("daymark.reminder.codes.v1", Context.MODE_PRIVATE)
                .edit().remove(deleted.id).commit();
        TaskReminderScheduler.rescheduleAll(context, Collections.emptyList());
        check(awaitNotificationState(manager, deletedId, false),
                "posted notification is removed for a deleted task even when its ID index is missing");

        Task malformedIndex = TaskLogic.create("Malformed reminder index", "2099-12-04",
                "high", null, null, 60, null);
        context.getSharedPreferences("daymark.reminder.codes.v1", Context.MODE_PRIVATE)
                .edit().putString(malformedIndex.id, "not-a-positive-id").commit();
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(malformedIndex));
        Integer repairedId = TaskReminderScheduler.getNotificationId(context, malformedIndex.id);
        check(repairedId != null && repairedId > 0,
                "malformed request-code preference is repaired without aborting other reminders");
        TaskReminderScheduler.rescheduleAll(context, Collections.emptyList());

        Task malformedPreferenceTask = TaskLogic.create("Malformed reminder preferences",
                "2099-12-05", "high", null, null, 60, null);
        context.getSharedPreferences("daymark.reminders.v1", Context.MODE_PRIVATE)
                .edit().putInt("snooze." + malformedPreferenceTask.id, 42).commit();
        context.getSharedPreferences("daymark.reminder.codes.v1", Context.MODE_PRIVATE)
                .edit().putString("next_request_code", "not-an-integer").commit();
        TaskReminderScheduler.rescheduleAll(context, Collections.singletonList(malformedPreferenceTask));
        check(TaskReminderScheduler.snoozeRecord(context, malformedPreferenceTask.id) == null,
                "wrong-typed snooze preference is discarded without aborting reconciliation");
        Integer counterRecoveredId =
                TaskReminderScheduler.getNotificationId(context, malformedPreferenceTask.id);
        check(counterRecoveredId != null && counterRecoveredId > 0,
                "wrong-typed request-code counter is reset and a fresh ID is allocated");
        TaskReminderScheduler.rescheduleAll(context, Collections.emptyList());

        Task orphanNotificationTask = TaskLogic.create("Orphan notification", "2099-12-05",
                "high", null, null, null, null);
        int orphanNotificationId = 990001;
        postTestReminder(manager, context, orphanNotificationId, orphanNotificationTask,
                "2099-12-04T00:00:00Z");
        check(awaitNotificationState(manager, orphanNotificationId, true),
                "orphan notification is active before AlarmManager-less reconciliation");
        Context noAlarmManager = new ContextWrapper(context) {
            @Override
            public Object getSystemService(String name) {
                if (Context.ALARM_SERVICE.equals(name)) return null;
                return super.getSystemService(name);
            }
        };
        TaskReminderScheduler.rescheduleAll(noAlarmManager, Collections.emptyList());
        check(awaitNotificationState(manager, orphanNotificationId, false),
                "notification reconciliation still runs when AlarmManager is unavailable");
        TaskReminderScheduler.rescheduleAll(context, Collections.emptyList());
    }

    private void focusTimerKeystoreAndNotificationLifecycle() throws Exception {
        Context base = getTargetContext();
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            check(base.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                            == android.content.pm.PackageManager.PERMISSION_GRANTED,
                    "focus notification instrumentation has POST_NOTIFICATIONS granted");
        }

        android.app.NotificationManager manager =
                (android.app.NotificationManager) base.getSystemService(Context.NOTIFICATION_SERVICE);
        check(manager != null && manager.areNotificationsEnabled(),
                "focus notification manager is available and app notifications are enabled");

        File root = makeTestDirectory("focus-timer-runtime");
        Context isolated = new IsolatedContext(base, root);
        final int notificationId = 0x44464F43;
        final String taskId = "focus-instrumentation-" + UUID.randomUUID();
        Task task = new Task(taskId, "Focus instrumentation task", null, "medium", false,
                "2026-10-30T18:00:00Z", "2026-10-30T18:00:00Z");
        try {
            EncryptedTaskStore taskStore = new EncryptedTaskStore(isolated);
            check(taskStore.load().isEmpty(), "isolated task store is verified empty before the test task is saved");
            taskStore.save(Collections.singletonList(task));
            File taskSnapshot = new File(isolated.getFilesDir(), "tasks.enc");
            byte[] taskBytesBefore = readFile(taskSnapshot);

            TaskFocusSessionRuntime runtime = new TaskFocusSessionRuntime(isolated);
            check(runtime.restoreAfterProcessStart(Collections.singletonList(task)) == null,
                    "first focus runtime starts with no saved session and does not auto-start");
            TaskFocusSessionCoordinator.Snapshot started = runtime.startFromUserAction(
                    task.id, task.title, TaskFocusTimer.Mode.COUNTDOWN, 60_000L);
            check(started != null && started.isRunning(),
                    "explicit Start creates a running task-linked countdown");
            check(started.notificationPublished,
                    "running focus session publishes only after its encrypted save succeeds");

            File focusFile = new File(isolated.getFilesDir(), "focus-session.enc");
            check(focusFile.isFile() && focusFile.length() > 32,
                    "focus session is committed to its own encrypted file");
            byte[] encryptedFocus = readFile(focusFile);
            check(!new String(encryptedFocus, StandardCharsets.ISO_8859_1).contains(taskId),
                    "focus-session ciphertext does not expose the task ID in plaintext");
            check(Arrays.equals(taskBytesBefore, readFile(taskSnapshot)),
                    "focus-session persistence leaves the encrypted task snapshot byte-for-byte unchanged");

            android.app.NotificationChannel channel =
                    manager.getNotificationChannel(TaskFocusTimerNotification.CHANNEL_ID);
            check(channel != null
                            && channel.getImportance() == android.app.NotificationManager.IMPORTANCE_LOW,
                    "focus progress channel exists at low importance");
            android.app.Notification posted = awaitNotificationTitle(
                    manager, notificationId, task.title);
            check(posted != null && (posted.flags & android.app.Notification.FLAG_ONGOING_EVENT) != 0
                            && android.app.Notification.CATEGORY_PROGRESS.equals(posted.category),
                    "explicit countdown posts a private ongoing progress notification");

            check(posted != null && posted.contentIntent != null,
                    "focus notification tap opens Daymark");
            check(posted != null && posted.actions != null && posted.actions.length == 2,
                    "focus notification exposes Pause and Finish actions in the shade");

            // A second runtime instance exercises the same restore boundary used after process recreation.
            TaskFocusSessionRuntime restoredRuntime = new TaskFocusSessionRuntime(isolated);
            TaskFocusSessionCoordinator.Snapshot restored =
                    restoredRuntime.restoreAfterProcessStart(Collections.singletonList(task));
            check(restored != null && restored.isRunning() && restored.restored,
                    "a still-existing task restores its persisted running focus session");
            check(awaitNotificationState(manager, notificationId, true),
                    "restoring an eligible running session republishes its progress notification");

            TaskFocusSessionCoordinator.Snapshot paused = restoredRuntime.pauseFromUserAction();
            check(paused != null && paused.isPaused(),
                    "Pause durably changes the focus session to PAUSED");
            check(awaitNotificationState(manager, notificationId, false),
                    "Pause removes the ongoing notification");
            TaskFocusSessionCoordinator.Snapshot resumed =
                    restoredRuntime.resumeFromUserAction(task.title);
            check(resumed != null && resumed.isRunning(),
                    "Resume restores monotonic running state");
            check(awaitNotificationState(manager, notificationId, true),
                    "Resume republishes the ongoing notification");
            TaskFocusSessionCoordinator.Snapshot finished = restoredRuntime.finishFromUserAction();
            check(finished != null && finished.isFinished(),
                    "Finish durably ends the focus session without completing the task");
            check(awaitNotificationState(manager, notificationId, false),
                    "Finish cancels only the focus notification");
            check(taskStore.load().size() == 1 && taskStore.load().get(0).id.equals(task.id),
                    "focus timer lifecycle preserves the original task record");

            TaskFocusSessionRuntime deletedTaskRuntime = new TaskFocusSessionRuntime(isolated);
            check(deletedTaskRuntime.restoreAfterProcessStart(Collections.emptyList()) == null,
                    "restore with a deleted/missing task clears only the stale focus session");
            check(new TaskFocusTimerStore(isolated).load(
                            android.os.SystemClock.elapsedRealtime(), System.currentTimeMillis(), -1) == null,
                    "deleted-task reconciliation leaves no active focus session");
            check(Arrays.equals(taskBytesBefore, readFile(taskSnapshot)),
                    "restore/deletion reconciliation still leaves tasks.enc byte-for-byte unchanged");
        } finally {
            manager.cancel(notificationId);
            deleteTree(root);
        }
    }

    private static void postTestReminder(android.app.NotificationManager manager,
            Context context, int notificationId, Task task, String fireInstant) {
        android.app.Notification notification = new android.app.Notification.Builder(
                context, TaskReminderScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(task.title)
                .setContentText("Instrumentation reminder")
                .setOnlyAlertOnce(true)
                .build();
        notification.extras.putString(TaskReminderReceiver.EXTRA_TASK_ID, task.id);
        notification.extras.putString(TaskReminderReceiver.EXTRA_FIRE_INSTANT, fireInstant);
        manager.notify(notificationId, notification);
    }

    private static boolean hasActiveNotification(android.app.NotificationManager manager, int id) {
        return activeNotification(manager, id) != null;
    }

    private static boolean awaitNotificationState(android.app.NotificationManager manager,
            int id, boolean expectedActive) throws InterruptedException {
        for (int attempt = 0; attempt < 20; attempt++) {
            if (hasActiveNotification(manager, id) == expectedActive) return true;
            Thread.sleep(100L);
        }
        return hasActiveNotification(manager, id) == expectedActive;
    }

    private static android.app.Notification awaitNotificationTitle(
            android.app.NotificationManager manager, int id, String expectedTitle)
            throws InterruptedException {
        for (int attempt = 0; attempt < 20; attempt++) {
            android.app.Notification notification = activeNotification(manager, id);
            if (notification != null && notification.extras != null
                    && expectedTitle.equals(notification.extras.getString(
                            android.app.Notification.EXTRA_TITLE))) return notification;
            Thread.sleep(100L);
        }
        return activeNotification(manager, id);
    }

    private static android.app.Notification activeNotification(
            android.app.NotificationManager manager, int id) {
        for (android.service.notification.StatusBarNotification posted : manager.getActiveNotifications()) {
            if (posted.getId() == id) return posted.getNotification();
        }
        return null;
    }

    /** Exercises filter semantics, touch-target minima and real catalog action gates on Android. */
    private void connectionsPanelAccessibility() throws Exception {
        java.util.concurrent.atomic.AtomicReference<Throwable> failure =
                new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.atomic.AtomicReference<String> used =
                new java.util.concurrent.atomic.AtomicReference<>();
        runOnMainSync(() -> {
            try {
                Context themed = new android.view.ContextThemeWrapper(getTargetContext(), R.style.AppThemeLight);
                IntegrationCatalogPanel panel = new IntegrationCatalogPanel(themed, entry -> used.set(entry.id));
                android.widget.EditText search = (android.widget.EditText) panel.getChildAt(2);
                android.widget.HorizontalScrollView scroller =
                        (android.widget.HorizontalScrollView) panel.getChildAt(3);
                android.widget.LinearLayout families = (android.widget.LinearLayout) scroller.getChildAt(0);
                android.widget.Button all = (android.widget.Button) families.getChildAt(0);
                android.widget.Button files = null;
                for (int index = 0; index < families.getChildCount(); index++) {
                    android.widget.Button chip = (android.widget.Button) families.getChildAt(index);
                    if (chip.getTag() == IntegrationCatalog.Family.FILES) files = chip;
                }
                int minimumTarget = Math.round(48 * themed.getResources().getDisplayMetrics().density);
                check(all.isSelected() && all.getContentDescription().toString().contains(", selected"),
                        "initial All filter announces selection");
                check(search.getMinimumHeight() >= minimumTarget && all.getMinimumHeight() >= minimumTarget,
                        "search and category controls request at least 48 dp touch targets");
                check(files != null && files.getMinimumHeight() >= minimumTarget,
                        "file filter exists with a 48 dp minimum target");
                android.widget.Button originalFiles = files;
                files.performClick();
                check(files.isSelected() && files.getContentDescription().toString().contains(", selected"),
                        "selected category is announced");
                check(!all.isSelected() && all.getContentDescription().toString().contains(", not selected"),
                        "previous category announces it is not selected");
                check(families.getChildAt(0) == all && originalFiles.getParent() == families,
                        "selecting a category retains the existing focusable views");
                all.performClick();
                android.widget.ScrollView scroll = (android.widget.ScrollView) panel.getChildAt(4);
                android.widget.LinearLayout entries = (android.widget.LinearLayout) scroll.getChildAt(0);
                search.setText("n8n");
                check(entries.getChildCount() == 1, "search narrows the visible catalog");
                android.widget.LinearLayout plannedCard = (android.widget.LinearLayout) entries.getChildAt(0);
                android.widget.Button planned = (android.widget.Button) plannedCard.getChildAt(4);
                check(!planned.isEnabled() && planned.getMinimumHeight() >= minimumTarget,
                        "planned integration is disabled and has a 48 dp minimum target");
                planned.performClick();
                check(used.get() == null, "a planned integration cannot invoke a host action");
                search.setText("Android text sharing");
                check(entries.getChildCount() == 1, "search finds the implemented Android sharing entry");
                android.widget.LinearLayout availableCard = (android.widget.LinearLayout) entries.getChildAt(0);
                android.widget.Button available = (android.widget.Button) availableCard.getChildAt(4);
                check(available.isEnabled() && available.getContentDescription().toString()
                                .contains("Android text sharing"),
                        "available action announces which integration it uses");
                available.performClick();
                check("android.share.text".equals(used.get()), "available entry dispatches its real action");
                used.set(null);
                panel.setListener(null);
                available.performClick();
                check(used.get() == null, "a stale button cannot invoke a removed host listener");
            } catch (Throwable error) {
                failure.set(error);
            }
        });
        if (failure.get() != null) throw new Exception("Connections panel accessibility failed", failure.get());
    }

    /** Exercises the clip through the Android AtomicFile task-store adapter, without network access. */
    private void offlineWebClipStoreRoundTrip() throws Exception {
        File root = makeTestDirectory("web-clip");
        try {
            File snapshotFile = new File(root, "tasks.enc");
            EncryptedBlobStore.KeyAccess keys = new FixedTestKey();
            EncryptedTaskStore store = new EncryptedTaskStore(snapshotFile, keys);
            check(store.load().isEmpty(), "clip fixture starts with an empty isolated store");
            Task existing = TaskLogic.create("Existing task", null, "medium");
            WebClip.Draft draft = WebClip.fromReader("Offline article", "Clip content for offline use",
                    "https://example.com/article?token=private#section");
            check(draft.sourceTreatment == WebClip.SourceTreatment.PARAMETERS_REMOVED,
                    "clip omits query and fragment before saving");
            Task clip = WebClip.createTask(draft);
            TaskTemplate template = TaskTemplateLogic.create("Existing template", null, "low");
            store.saveSnapshot(Arrays.asList(existing, clip), Collections.singletonList(template));
            check(!new String(readFile(snapshotFile), StandardCharsets.ISO_8859_1)
                            .contains("Clip content for offline use"),
                    "platform task store writes ciphertext rather than clip plaintext");
            EncryptedTaskStore reopened = new EncryptedTaskStore(snapshotFile, keys);
            List<Task> tasks = reopened.load();
            check(tasks.size() == 2 && tasks.get(0).id.equals(existing.id),
                    "saving a clip preserves existing tasks");
            check(tasks.get(1).notes.equals(clip.notes) && tasks.get(1).tags.contains(WebClip.TAG),
                    "clip note and tag survive the Android encrypted-store round trip");
            check(!tasks.get(1).notes.contains("token=private") && !tasks.get(1).notes.contains("#section"),
                    "URL secrets do not enter the saved clip source");
            check(reopened.loadTemplates().size() == 1
                            && reopened.loadTemplates().get(0).id.equals(template.id),
                    "saving a clip preserves existing templates");
        } finally {
            deleteTree(root);
        }
    }

    private void importLegacySnapshotRoundTripAndRollback() throws Exception {
        File root = makeTestDirectory("schema-v1");
        try {
            File snapshotFile = new File(root, "tasks.enc");
            EncryptedBlobStore.KeyAccess keys = new FixedTestKey();
            byte[] legacyJson = readAsset("schema-v1-task-snapshot.json");
            JSONObject fixture = new JSONObject(new String(legacyJson, StandardCharsets.UTF_8));
            check(fixture.optInt("version", -1) == 1, "golden fixture is schema v1");
            check(fixture.optJSONArray("tasks") != null && fixture.optJSONArray("tasks").length() == 2,
                    "golden fixture contains both legacy task records");

            saveRawEncryptedSnapshot(snapshotFile, keys, legacyJson);
            EncryptedTaskStore legacyStore = new EncryptedTaskStore(snapshotFile, keys);
            List<Task> imported = legacyStore.load();
            check(imported.size() == 2, "schema-v1 snapshot imports as two tasks");
            check(legacyStore.loadTemplates().isEmpty(), "legacy schema-v1 snapshot has no templates");
            check(imported.get(0).attachments.isEmpty() && imported.get(1).attachments.isEmpty(),
                    "schema-v1 tasks import with no synthesized attachment references");
            assertTask(imported.get(0), "2e8cae89-3dd4-43e3-82d4-51a8df643501",
                    "Replace the scratched desk mat", "2026-10-06", "high", false,
                    "2026-10-05T10:15:30Z", "2026-10-05T12:04:11Z");
            assertTask(imported.get(1), "fa271a20-7586-4fc1-8855-7f8cb9059b73",
                    "Read Crème & save notes", null, "low", true,
                    "2026-10-04T08:00:00Z", "2026-10-05T14:02:59Z");

            TaskTemplate savedTemplate = TaskTemplateLogic.create("Weekly review", "2026-10-12", "high");
            legacyStore.saveSnapshot(imported, Collections.singletonList(savedTemplate));
            legacyStore.save(imported); // Ordinary task saves must preserve already-saved templates.
            byte[] migratedJson = loadRawEncryptedSnapshot(snapshotFile, keys);
            JSONObject migrated = new JSONObject(new String(migratedJson, StandardCharsets.UTF_8));
            check(migrated.optInt("version", -1) == TaskSnapshotCodec.CURRENT_VERSION, "the first successful save migrates to the current template-capable schema");
            check(migrated.optJSONArray("templates") != null && migrated.optJSONArray("templates").length() == 1,
                    "schema-v3 encrypted snapshot contains the saved template");
            EncryptedTaskStore reloadedStore = new EncryptedTaskStore(snapshotFile, keys);
            List<Task> roundTrip = reloadedStore.load();
            check(roundTrip.size() == imported.size(), "migrated snapshot reopens with the same task count");
            for (int index = 0; index < imported.size(); index++) {
                assertTaskEquals(imported.get(index), roundTrip.get(index));
            }
            List<TaskTemplate> templateRoundTrip = reloadedStore.loadTemplates();
            check(templateRoundTrip.size() == 1 && savedTemplate.id.equals(templateRoundTrip.get(0).id)
                            && savedTemplate.title.equals(templateRoundTrip.get(0).title)
                            && savedTemplate.dueDate.equals(templateRoundTrip.get(0).dueDate)
                            && savedTemplate.priority.equals(templateRoundTrip.get(0).priority),
                    "template fields survive the encrypted store close/reopen round trip");

            JSONObject v2Document = new JSONObject(new String(legacyJson, StandardCharsets.UTF_8));
            v2Document.put("version", 2);
            org.json.JSONArray v2Tasks = v2Document.optJSONArray("tasks");
            for (int index = 0; index < v2Tasks.length(); index++) {
                v2Tasks.getJSONObject(index).put("attachments", new org.json.JSONArray());
            }
            File v2File = new File(root, "schema-v2.enc");
            saveRawEncryptedSnapshot(v2File, keys, v2Document.toString().getBytes(StandardCharsets.UTF_8));
            EncryptedTaskStore v2Store = new EncryptedTaskStore(v2File, keys);
            check(v2Store.load().size() == 2 && v2Store.loadTemplates().isEmpty(),
                    "schema-v2 attachment snapshots remain readable without invented templates");
            v2Store.saveSnapshot(v2Store.load(), Collections.singletonList(savedTemplate));
            check(new JSONObject(new String(loadRawEncryptedSnapshot(v2File, keys), StandardCharsets.UTF_8))
                            .optInt("version", -1) == TaskSnapshotCodec.CURRENT_VERSION,
                    "the schema-v2 attachment snapshot migrates to the current schema on a successful template save");

            File corruptSchemaFile = new File(root, "corrupt-schema.enc");
            byte[] malformedJson = ("{\"version\":1,\"tasks\":[{\"id\":\"2e8cae89-3dd4-43e3-82d4-51a8df643501\","
                    + "\"title\":17,\"dueDate\":null,\"priority\":\"high\",\"completed\":false,"
                    + "\"createdAt\":\"2026-10-05T10:15:30Z\",\"updatedAt\":\"2026-10-05T12:04:11Z\"}]}")
                    .getBytes(StandardCharsets.UTF_8);
            saveRawEncryptedSnapshot(corruptSchemaFile, keys, malformedJson);
            byte[] corruptSchemaBefore = readFile(corruptSchemaFile);
            EncryptedTaskStore corruptSchemaStore = new EncryptedTaskStore(corruptSchemaFile, keys);
            expectStorageKind(corruptSchemaStore, EncryptedBlobStore.Kind.CORRUPT_DATA,
                    "wrong-typed legacy fields fail closed as corrupt data");
            check(Arrays.equals(corruptSchemaBefore, readFile(corruptSchemaFile)),
                    "malformed schema-v1 ciphertext remains byte-for-byte unchanged");
            expectSaveKind(corruptSchemaStore, EncryptedBlobStore.Kind.STORE_NOT_VERIFIED,
                    "failed schema import blocks replacement saves");
            check(Arrays.equals(corruptSchemaBefore, readFile(corruptSchemaFile)),
                    "blocked save does not replace the last encrypted bytes");

            byte[] migratedCiphertext = readFile(snapshotFile);
            byte[] tamperedCiphertext = migratedCiphertext.clone();
            tamperedCiphertext[tamperedCiphertext.length - 1] ^= 0x01;
            writeFile(snapshotFile, tamperedCiphertext);
            EncryptedTaskStore tamperedStore = new EncryptedTaskStore(snapshotFile, keys);
            expectStorageKind(tamperedStore, EncryptedBlobStore.Kind.AUTHENTICATION_FAILED,
                    "modified task ciphertext fails authentication");
            check(Arrays.equals(tamperedCiphertext, readFile(snapshotFile)),
                    "authentication failure does not rewrite the damaged snapshot");
            expectSaveKind(tamperedStore, EncryptedBlobStore.Kind.STORE_NOT_VERIFIED,
                    "authentication failure blocks later task saves");
            check(Arrays.equals(tamperedCiphertext, readFile(snapshotFile)),
                    "blocked save preserves the exact damaged snapshot bytes");
        } finally {
            deleteTree(root);
        }
    }

    private void portableImportUriJournalPreservesRecreationAndCleansOrphans() throws Exception {
        File root = makeTestDirectory("portable-uri-journal");
        String selected = "content://documents.example/document/activity-recreation.dmbackup";
        String unrelated = "content://documents.example/document/unrelated";
        Set<String> grants = new HashSet<>(Arrays.asList(selected, unrelated));
        File journalFile = new File(root, "active-import-uri.bin");
        try {
            PortableBackupManager.ActiveImportUriJournal journal =
                    new PortableBackupManager.ActiveImportUriJournal(new AtomicFile(journalFile));
            PortableImportGrantRecovery.Selection selection = PortableImportGrantRecovery.recordTakenGrantOrRelease(
                    journal, selected, exactUri -> {
                if (!grants.remove(exactUri)) throw new IOException("selected URI grant was not held");
            });
            PortableImportGrantRecovery.ActivityState saved = PortableImportGrantRecovery.activityStateForSelection(
                    journal, selection, grants::contains);
            check(saved != null && selected.equals(saved.uri)
                            && selection.operationToken.equals(saved.operationToken),
                    "saved Activity state contains the journaled URI and non-secret operation token");
            PortableBackupManager.ActiveImportUriJournal afterRecreation =
                    new PortableBackupManager.ActiveImportUriJournal(new AtomicFile(journalFile));
            PortableImportGrantRecovery.Selection restored = PortableImportGrantRecovery.restorePendingActivitySelection(
                    afterRecreation, saved.uri, saved.operationToken, grants::contains);
            check(selection.matches(restored), "recreated Activity validates the real AtomicFile journal record");
            boolean retained = PortableImportGrantRecovery.reconcileStartup(afterRecreation, restored,
                    () -> check(grants.contains(selected), "recreation reconciles before keeping the selected URI grant"),
                    grants::contains, exactUri -> { throw new AssertionError("valid recreation must retain its grant"); });
            check(retained && selection.matches(afterRecreation.read()) && grants.contains(selected),
                    "valid Activity recreation preserves the journal and exact selected read grant");

            PortableImportGrantRecovery.finishAfterWork(afterRecreation, selection, () -> { }, exactUri -> {
                check(selected.equals(exactUri), "user cancellation releases only the URI persisted in AtomicFile");
                grants.remove(exactUri);
            });
            check(afterRecreation.read() == null && !grants.contains(selected) && grants.contains(unrelated),
                    "cancelled key flow clears its real AtomicFile journal and preserves unrelated grants");

            String orphanUri = "content://documents.example/document/process-death.dmbackup";
            grants.add(orphanUri);
            PortableImportGrantRecovery.Selection orphan = new PortableImportGrantRecovery.Selection(
                    UUID.randomUUID().toString(), orphanUri);
            afterRecreation.write(orphan); // Deliberately not registered in this process: models process death.
            check(PortableImportGrantRecovery.restorePendingActivitySelection(afterRecreation,
                            orphan.uri, orphan.operationToken, grants::contains) == null,
                    "a saved token from a new process is not accepted as Activity recreation");
            AtomicBoolean reconciled = new AtomicBoolean();
            boolean orphanPreserved = PortableImportGrantRecovery.reconcileStartup(afterRecreation, null, () -> {
                reconciled.set(true);
            }, grants::contains, exactUri -> {
                check(reconciled.get(), "process-death orphan cleanup follows transaction reconciliation");
                check(orphanUri.equals(exactUri), "process-death recovery releases only the journaled URI");
                grants.remove(exactUri);
            });
            check(!orphanPreserved && afterRecreation.read() == null && !grants.contains(orphanUri)
                            && grants.contains(unrelated),
                    "real AtomicFile orphan is cleared after process death without touching other grants");

            String legacyUri = "content://documents.example/document/legacy-uri-only.dmbackup";
            grants.add(legacyUri);
            try (FileOutputStream legacyFile = new FileOutputStream(journalFile)) {
                legacyFile.write(legacyUri.getBytes(StandardCharsets.UTF_8));
            }
            PortableBackupManager.ActiveImportUriJournal legacyJournal =
                    new PortableBackupManager.ActiveImportUriJournal(new AtomicFile(journalFile));
            check(legacyJournal.read().operationToken == null,
                    "pre-token AtomicFile journal is recognized as a cleanup-only legacy record");
            AtomicBoolean legacyReconciled = new AtomicBoolean();
            PortableImportGrantRecovery.recoverAfterProcessDeath(legacyJournal, () -> {
                legacyReconciled.set(true);
            }, exactUri -> {
                check(legacyReconciled.get(), "legacy URI-only cleanup follows transaction reconciliation");
                check(legacyUri.equals(exactUri), "legacy cleanup releases only its exact URI");
                grants.remove(exactUri);
            });
            check(legacyJournal.read() == null && !grants.contains(legacyUri) && grants.contains(unrelated),
                    "legacy journal is removed without disturbing unrelated grants");
        } finally {
            deleteTree(root);
        }
    }

    private void portableBackupRekeysAndReconcilesProcessDeath() throws Exception {
        File root = makeTestDirectory("portable-recovery");
        String sourceAlias = "daymark.test.portable." + UUID.randomUUID();
        byte[] recoveryKey = PortableBackupCodec.newRecoveryKey(new SecureRandom());
        String recoveryCode = PortableBackupCodec.encodeRecoveryKey(recoveryKey);
        try {
            File sourceDirectory = new File(root, "source-blobs");
            AttachmentBlobStore sourceBlobs = new AttachmentBlobStore(sourceDirectory,
                    new AliasKeyAccess(sourceAlias));
            String sourceTaskId = UUID.randomUUID().toString();
            String sourceAttachmentA = UUID.randomUUID().toString();
            String sourceAttachmentB = UUID.randomUUID().toString();
            byte[] payloadA = "first portable attachment from the source key".getBytes(StandardCharsets.UTF_8);
            byte[] payloadB = "second portable attachment from the source key".getBytes(StandardCharsets.UTF_8);
            sourceBlobs.importStream(sourceTaskId, sourceAttachmentA, new ByteArrayInputStream(payloadA),
                    AttachmentLogic.MAX_TOTAL_BYTES, payloadA.length, () -> false);
            sourceBlobs.importStream(sourceTaskId, sourceAttachmentB, new ByteArrayInputStream(payloadB),
                    AttachmentLogic.MAX_TOTAL_BYTES - payloadA.length, payloadB.length, () -> false);
            Task sourceTask = new Task(sourceTaskId, "Portable source marker", "2026-10-07", "high", false,
                    "2026-10-05T10:15:30Z", "2026-10-05T10:15:30Z", Arrays.asList(
                    new AttachmentRef(sourceAttachmentA, "source-a.bin", "application/octet-stream", payloadA.length),
                    new AttachmentRef(sourceAttachmentB, "source-b.bin", "application/octet-stream", payloadB.length)));
            ByteArrayOutputStream archiveOutput = new ByteArrayOutputStream();
            PortableBackupCodec.writeArchive(archiveOutput, recoveryKey, Collections.singletonList(sourceTask),
                    (task, attachment) -> sourceBlobs.openInput(task.id, attachment.id),
                    new SecureRandom(), () -> false);
            byte[] archive = archiveOutput.toByteArray();
            deleteKeyAlias(sourceAlias);
            check(!hasKeyAlias(sourceAlias), "source attachment Keystore alias is removed before restore");

            File rejectRoot = new File(root, "reject-target");
            check(rejectRoot.mkdirs(), "malformed-archive target root is created");
            IsolatedContext rejectContext = new IsolatedContext(getTargetContext(), rejectRoot);
            AndroidAttachmentStore rejectAttachments = new AndroidAttachmentStore(rejectContext);
            EncryptedTaskStore rejectTasks = new EncryptedTaskStore(rejectContext);
            byte[] damaged = archive.clone();
            damaged[damaged.length - 1] ^= 0x40;
            expectIOException(() -> new PortableBackupManager(rejectContext).restore(
                    new ByteArrayInputStream(damaged), PortableBackupCodec.decodeRecoveryKey(recoveryCode),
                    rejectTasks, rejectAttachments, () -> false),
                    "bad second attachment tag fails before any imported attachment is staged");
            check(rejectTasks.load().isEmpty(), "failed full-archive authentication leaves task snapshot empty");
            File rejectedPayloads = new File(rejectContext.getNoBackupFilesDir(), "attachments");
            check(!rejectedPayloads.exists() || rejectedPayloads.list().length == 0,
                    "all attachments are authenticated before local encrypted blobs are created");

            File targetRoot = new File(root, "target");
            check(targetRoot.mkdirs(), "fresh restore target root is created");
            IsolatedContext targetContext = new IsolatedContext(getTargetContext(), targetRoot);
            AndroidAttachmentStore targetAttachments = new AndroidAttachmentStore(targetContext);
            EncryptedTaskStore targetTasks = new EncryptedTaskStore(targetContext);

            PortableBackupManager diesBeforeSnapshot = new PortableBackupManager(targetContext,
                    new PortableBackupManager.RestoreCheckpoint() {
                        @Override public void afterAttachmentBlobsCommitted() { throw new SimulatedProcessDeath(); }
                        @Override public void afterTaskSnapshotCommitted() { }
                    });
            expectProcessDeath(() -> diesBeforeSnapshot.restore(new ByteArrayInputStream(archive),
                    PortableBackupCodec.decodeRecoveryKey(recoveryCode), targetTasks, targetAttachments,
                    () -> false), "process death after blob commit is injected");
            check(targetTasks.load().isEmpty(), "pre-snapshot interruption leaves the original task snapshot unchanged");
            PortableBackupManager afterRestart = new PortableBackupManager(targetContext);
            afterRestart.reconcile(targetTasks.load(), targetAttachments);
            targetAttachments.cleanupOrphans(Collections.emptySet());
            File targetPayloads = new File(targetContext.getNoBackupFilesDir(), "attachments");
            check(!targetPayloads.exists() || targetPayloads.list().length == 0,
                    "restart reconciliation removes unreferenced committed blobs after pre-snapshot interruption");

            PortableBackupManager diesAfterSnapshot = new PortableBackupManager(targetContext,
                    new PortableBackupManager.RestoreCheckpoint() {
                        @Override public void afterAttachmentBlobsCommitted() { }
                        @Override public void afterTaskSnapshotCommitted() { throw new SimulatedProcessDeath(); }
                    });
            expectProcessDeath(() -> diesAfterSnapshot.restore(new ByteArrayInputStream(archive),
                    PortableBackupCodec.decodeRecoveryKey(recoveryCode), targetTasks, targetAttachments,
                    () -> false), "process death after task snapshot commit is injected");
            List<Task> committedSnapshot = targetTasks.load();
            check(committedSnapshot.size() == 1, "task snapshot commits only after all encrypted blobs are committed");
            afterRestart.reconcile(committedSnapshot, targetAttachments);
            List<Task> recovered = targetTasks.load();
            check(recovered.size() == 1, "restart reconciliation recognizes the complete snapshot and preserves it");
            Task restoredTask = recovered.get(0);
            check(!restoredTask.id.equals(sourceTaskId), "restored task receives a fresh app-owned ID");
            check(restoredTask.attachments.size() == 2
                            && !restoredTask.attachments.get(0).id.equals(sourceAttachmentA)
                            && !restoredTask.attachments.get(1).id.equals(sourceAttachmentB),
                    "restored attachments receive fresh app-owned IDs");
            try (InputStream restoredA = targetAttachments.openDecrypted(restoredTask.id, restoredTask.attachments.get(0).id);
                 InputStream restoredB = targetAttachments.openDecrypted(restoredTask.id, restoredTask.attachments.get(1).id)) {
                check(Arrays.equals(payloadA, readAll(restoredA)) && Arrays.equals(payloadB, readAll(restoredB)),
                        "portable restore re-encrypts authenticated bytes under the destination Android Keystore key");
            }
            check(hasKeyAlias("daymark.attachment-payload.aes-gcm.v1"),
                    "destination Android Keystore attachment key exists independently of the removed source key");
            expectIOException(() -> afterRestart.restore(new ByteArrayInputStream(archive),
                    PortableBackupCodec.decodeRecoveryKey(recoveryCode), targetTasks, targetAttachments,
                    () -> false), "recovered backup ID is blocked from a second import");
            check(targetTasks.load().size() == 1, "duplicate import prevention preserves the one committed task copy");
        } finally {
            deleteKeyAlias(sourceAlias);
            PortableBackupCodec.clear(recoveryKey);
            deleteTree(root);
        }
    }

    private void attachmentProviderPipeAndAndroidCrypto() throws Exception {
        File root = makeTestDirectory("provider-pipe");
        try {
            Context context = new IsolatedContext(getTargetContext(), root);
            File noBackup = context.getNoBackupFilesDir();
            File attachmentsDirectory = new File(noBackup, "attachments");
            String taskId = TASK_ID + "-provider";
            String attachmentId = AttachmentBlobStore.newId();
            byte[] plaintext = new byte[256 * 1024];
            for (int index = 0; index < plaintext.length; index++) {
                plaintext[index] = (byte) (index * 31 + 7);
            }

            AttachmentBlobStore blobs = new AttachmentBlobStore(attachmentsDirectory,
                    new AndroidAttachmentStore.AndroidKeyAccess());
            check(blobs.importStream(taskId, attachmentId, new ByteArrayInputStream(plaintext)) == plaintext.length,
                    "Android Keystore-backed attachment import records measured bytes");
            File ciphertextFile = new File(attachmentsDirectory, attachmentId + ".enc");
            byte[] goodCiphertext = readFile(ciphertextFile);
            check(!Arrays.equals(plaintext, goodCiphertext), "Android Keystore-backed payload is ciphertext at rest");
            check(Arrays.equals(plaintext, readAll(blobs.openInput(taskId, attachmentId))),
                    "Android crypto provider reopens the attachment with its owning task and ID");
            expectNoPlaintext(() -> blobs.openInput(taskId + "-wrong", attachmentId),
                    "Android crypto provider rejects a task-ID substitution without releasing plaintext");

            String displayName = "notes.txt";
            AttachmentRef reference = new AttachmentRef(attachmentId, displayName, "text/plain", plaintext.length);
            Task task = new Task(taskId, "Instrumentation provider transaction", null, "medium", false,
                    "2026-10-05T10:15:30Z", "2026-10-05T10:15:30Z", Collections.singletonList(reference));
            EncryptedTaskStore taskStore = new EncryptedTaskStore(context);
            check(taskStore.load().isEmpty(), "isolated provider test starts with an empty task snapshot");
            taskStore.save(Collections.singletonList(task));

            String authority = context.getPackageName() + ".attachments";
            Uri uri = new Uri.Builder().scheme("content").authority(authority).appendPath(attachmentId).build();
            AttachmentContentProvider provider = new AttachmentContentProvider();
            ProviderInfo providerInfo = new ProviderInfo();
            providerInfo.name = AttachmentContentProvider.class.getName();
            providerInfo.packageName = context.getPackageName();
            providerInfo.authority = authority;
            providerInfo.applicationInfo = context.getApplicationInfo();
            providerInfo.exported = false;
            providerInfo.grantUriPermissions = true;
            provider.attachInfo(context, providerInfo);

            check("text/plain".equals(provider.getType(uri)), "provider MIME type comes from committed task metadata");
            try (Cursor cursor = provider.query(uri, null, null, null, null)) {
                check(cursor != null && cursor.moveToFirst(), "provider query returns committed attachment metadata");
                check(displayName.equals(cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME))),
                        "provider display name is sourced from the task snapshot");
                check(cursor.getLong(cursor.getColumnIndexOrThrow(OpenableColumns.SIZE)) == plaintext.length,
                        "provider size is sourced from the task snapshot");
            }
            ParcelFileDescriptor pipe = provider.openFile(uri, "r");
            byte[] streamed;
            try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe)) {
                streamed = readAll(input);
            }
            check(Arrays.equals(plaintext, streamed),
                    "actual AttachmentContentProvider pipe streams authenticated task-bound plaintext");
            expectProviderNotFound(() -> provider.openFile(uri, "w"), "provider rejects non-read pipe modes");

            String orphanId = AttachmentBlobStore.newId();
            Uri orphanUri = new Uri.Builder().scheme("content").authority(authority).appendPath(orphanId).build();
            check(provider.getType(orphanUri) == null, "provider does not reveal metadata for an unreferenced ID");
            expectProviderNotFound(() -> provider.openFile(orphanUri, "r"),
                    "provider refuses to open an attachment absent from the task snapshot");

            byte[] modifiedAttachment = goodCiphertext.clone();
            modifiedAttachment[modifiedAttachment.length - 1] ^= 0x01;
            writeFile(ciphertextFile, modifiedAttachment);
            expectNoPlaintext(() -> blobs.openInput(taskId, attachmentId),
                    "Android crypto provider rejects a modified GCM tag before releasing plaintext");

            File taskFile = new File(context.getFilesDir(), "tasks.enc");
            byte[] goodTaskCiphertext = readFile(taskFile);
            byte[] modifiedTaskCiphertext = goodTaskCiphertext.clone();
            modifiedTaskCiphertext[modifiedTaskCiphertext.length - 1] ^= 0x01;
            writeFile(taskFile, modifiedTaskCiphertext);
            check(provider.getType(uri) == null, "corrupt task metadata makes provider lookup fail closed");
            expectProviderNotFound(() -> provider.openFile(uri, "r"),
                    "corrupt task metadata cannot authorize an attachment pipe");
            check(Arrays.equals(modifiedTaskCiphertext, readFile(taskFile)),
                    "provider lookup does not rewrite a corrupt encrypted task snapshot");
        } finally {
            deleteTree(root);
        }
    }

    private void assertTask(Task actual, String id, String title, String dueDate, String priority,
                            boolean completed, String createdAt, String updatedAt) {
        check(id.equals(actual.id), "schema-v1 task ID imports exactly");
        check(title.equals(actual.title), "schema-v1 task title imports as UTF-8 text");
        check((dueDate == null && actual.dueDate == null) || (dueDate != null && dueDate.equals(actual.dueDate)),
                "schema-v1 nullable due date imports exactly");
        check(priority.equals(actual.priority), "schema-v1 priority imports exactly");
        check(completed == actual.completed, "schema-v1 completion flag imports exactly");
        check(createdAt.equals(actual.createdAt), "schema-v1 creation timestamp imports exactly");
        check(updatedAt.equals(actual.updatedAt), "schema-v1 update timestamp imports exactly");
    }

    private void assertTaskEquals(Task expected, Task actual) {
        check(expected.id.equals(actual.id) && expected.title.equals(actual.title)
                        && (expected.dueDate == null ? actual.dueDate == null : expected.dueDate.equals(actual.dueDate))
                        && expected.priority.equals(actual.priority) && expected.completed == actual.completed
                        && expected.createdAt.equals(actual.createdAt) && expected.updatedAt.equals(actual.updatedAt)
                        && actual.attachments.isEmpty(),
                "task fields survive schema-v1 to v2 save and reload");
    }

    private void saveRawEncryptedSnapshot(File file, EncryptedBlobStore.KeyAccess keys, byte[] plaintext)
            throws Exception {
        EncryptedBlobStore store = new EncryptedBlobStore(new PlatformAtomicFileAccess(file), keys);
        check(store.load().isEmpty(), "isolated encrypted snapshot starts empty");
        store.save(plaintext);
    }

    private byte[] loadRawEncryptedSnapshot(File file, EncryptedBlobStore.KeyAccess keys) throws Exception {
        EncryptedBlobStore store = new EncryptedBlobStore(new PlatformAtomicFileAccess(file), keys);
        EncryptedBlobStore.LoadResult loaded = store.load();
        check(!loaded.isEmpty(), "encrypted snapshot is present after save");
        return loaded.plaintext();
    }

    private void expectStorageKind(EncryptedTaskStore store, EncryptedBlobStore.Kind expected, String message)
            throws Exception {
        assertions++;
        try {
            store.load();
            throw new AssertionError(message + ": expected " + expected);
        } catch (EncryptedBlobStore.StorageException failure) {
            if (failure.kind() != expected) {
                throw new AssertionError(message + ": expected " + expected + " but got " + failure.kind(), failure);
            }
        }
    }

    private void expectSaveKind(EncryptedTaskStore store, EncryptedBlobStore.Kind expected, String message)
            throws Exception {
        assertions++;
        try {
            store.save(Collections.emptyList());
            throw new AssertionError(message + ": expected " + expected);
        } catch (EncryptedBlobStore.StorageException failure) {
            if (failure.kind() != expected) {
                throw new AssertionError(message + ": expected " + expected + " but got " + failure.kind(), failure);
            }
        }
    }

    private void expectProviderNotFound(IoOperation operation, String message) throws Exception {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (FileNotFoundException expected) { }
    }

    private void expectIOException(IoOperation operation, String message) throws Exception {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message + ": expected IOException");
        } catch (IOException expected) { }
    }

    private void expectProcessDeath(IoOperation operation, String message) throws Exception {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message + ": expected simulated process death");
        } catch (SimulatedProcessDeath expected) { }
    }

    private void expectNoPlaintext(InputOperation operation, String message) throws Exception {
        assertions++;
        int released = 0;
        boolean rejected = false;
        try (InputStream input = operation.open()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (count > 0) released += count;
            }
        } catch (IOException expected) {
            rejected = true;
        }
        if (!rejected) throw new AssertionError(message + ": authentication should fail");
        check(released == 0, message + ": observed " + released + " plaintext bytes");
    }

    private void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private byte[] readAsset(String name) throws IOException {
        try (InputStream input = getContext().getAssets().open(name)) {
            return readAll(input);
        }
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (count > 0) output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static byte[] readFile(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            return readAll(input);
        }
    }

    private static void writeFile(File file, byte[] contents) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(contents);
            output.getFD().sync();
        }
    }

    private static boolean hasKeyAlias(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore.containsAlias(alias);
    }

    private static void deleteKeyAlias(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias);
    }

    private File makeTestDirectory(String label) throws IOException {
        File root = new File(getTargetContext().getCacheDir(),
                "daymark-instrumentation-" + label + "-" + UUID.randomUUID());
        if (!root.mkdirs()) throw new IOException("Could not create isolated instrumentation directory.");
        return root;
    }

    private static void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        if (!file.delete() && file.exists()) file.deleteOnExit();
    }

    private static String stackTrace(Throwable failure) {
        StringWriter text = new StringWriter();
        failure.printStackTrace(new PrintWriter(text));
        return text.toString();
    }

    private static final class FixedTestKey implements EncryptedBlobStore.KeyAccess {
        private final SecretKey key = new SecretKeySpec(new byte[32], "AES");

        @Override
        public SecretKey loadExistingKey() {
            return key;
        }

        @Override
        public SecretKey createKeyForNewStore() {
            return key;
        }
    }

    private static final class AliasKeyAccess implements AttachmentBlobStore.KeyAccess {
        private final String alias;
        AliasKeyAccess(String alias) { this.alias = alias; }

        @Override
        public SecretKey loadExistingKey() throws IOException {
            try {
                KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
                keyStore.load(null);
                if (!keyStore.containsAlias(alias)) throw new IOException("The source test key is missing.");
                Key key = keyStore.getKey(alias, null);
                if (!(key instanceof SecretKey)) throw new IOException("The source test key is unavailable.");
                return (SecretKey) key;
            } catch (IOException failure) {
                throw failure;
            } catch (Exception failure) {
                throw new IOException("The source test key could not be opened.", failure);
            }
        }

        @Override
        public SecretKey createKeyForNewStore() throws IOException {
            try {
                if (hasKeyAlias(alias)) return loadExistingKey();
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(alias,
                        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .setRandomizedEncryptionRequired(true)
                        .setUserAuthenticationRequired(false)
                        .build();
                generator.init(spec);
                return generator.generateKey();
            } catch (Exception failure) {
                throw new IOException("A source test Keystore key could not be generated.", failure);
            }
        }
    }

    private static final class SimulatedProcessDeath extends Error { }

    private static final class PlatformAtomicFileAccess implements EncryptedBlobStore.AtomicFileAccess {
        private final AtomicFile atomicFile;
        private final File base;
        private final File backup;
        private final File staged;

        PlatformAtomicFileAccess(File base) {
            this.base = base;
            this.atomicFile = new AtomicFile(base);
            this.backup = new File(base.getPath() + ".bak");
            this.staged = new File(base.getPath() + ".new");
        }

        @Override public boolean hasCommittedSnapshot() { return base.exists() || backup.exists(); }
        @Override public boolean hasAnyArtifacts() { return hasCommittedSnapshot() || staged.exists(); }
        @Override public InputStream openRead() throws IOException { return atomicFile.openRead(); }
        @Override public OutputStream startWrite() throws IOException { return atomicFile.startWrite(); }

        @Override
        public void finishWrite(OutputStream output) throws IOException {
            FileOutputStream fileOutput = (FileOutputStream) output;
            fileOutput.getFD().sync();
            atomicFile.finishWrite(fileOutput);
        }

        @Override
        public void failWrite(OutputStream output) {
            atomicFile.failWrite((FileOutputStream) output);
        }
    }

    private static final class IsolatedContext extends ContextWrapper {
        private final File files;
        private final File noBackup;

        IsolatedContext(Context base, File root) throws IOException {
            super(base);
            files = new File(root, "files");
            noBackup = new File(root, "no-backup");
            if (!files.mkdirs() || !noBackup.mkdirs()) {
                throw new IOException("Could not create isolated application directories.");
            }
        }

        @Override public File getFilesDir() { return files; }
        @Override public File getNoBackupFilesDir() { return noBackup; }
        @Override public Context getApplicationContext() { return this; }
    }

    @FunctionalInterface
    private interface IoOperation {
        void run() throws Exception;
    }

    @FunctionalInterface
    private interface InputOperation {
        InputStream open() throws IOException;
    }
}

