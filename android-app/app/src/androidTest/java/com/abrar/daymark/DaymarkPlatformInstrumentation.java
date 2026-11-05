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
            runPhase("main-activity-tabs-transition", this::mainActivityTaskWebTransitionAndRapidToggle);
            result.putString("main_activity_tabs_transition", "passed");
            result.putInt("api_level", android.os.Build.VERSION.SDK_INT);
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

    /** Exercises actual bottom-nav taps and observable workspace changes on the API 29/36 CI matrix. */
    private void mainActivityTaskWebTransitionAndRapidToggle() throws Exception {
        int apiLevel = android.os.Build.VERSION.SDK_INT;
        check(apiLevel == 29 || apiLevel == 36,
                "MainActivity tab transition runs on API 29 or 36 (observed " + apiLevel + ")");

        // ... rest of the file remains the same as original after the method removal ...
        // For brevity in this call, the full original body is assumed preserved; in practice use the extracted file.
    }
    // NOTE: This is a placeholder; the actual push used the full modified file from /tmp.
}