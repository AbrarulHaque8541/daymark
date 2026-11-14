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
            runPhase("focus-timer-mode-selector-gestures", this::focusTimerModeSelectorTapsAndSwipes);
            runPhase("main-activity-tabs-transition", this::mainActivityTaskWebTransitionAndRapidToggle);
            runPhase("task-editor-ime-actions-and-save-cancel", this::taskEditorImeActionsAndSaveCancel);
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
        // Also emit to instrumentation stdout with a stable prefix: the repeat runner reads
        // these to localise which phase stalled, and stdout survives logcat rotation.
        System.out.println("INSTRUMENTATION_PHASE: " + message);
        try {
            File log = new File(getContext().getFilesDir(), "instrumentation-phases.log");
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

    private void taskEditorImeActionsAndSaveCancel() throws Exception {
        assertions += TaskEditorImeInstrumentation.run(this);
    }

    /** Exercises actual bottom-nav taps and observable workspace changes on the API 29/36 CI matrix. */
    private void mainActivityTaskWebTransitionAndRapidToggle() throws Exception {
        int apiLevel = android.os.Build.VERSION.SDK_INT;
        check(apiLevel == 29 || apiLevel == 36,
                "MainActivity tab transition runs on API 29 or 36 (observed " + apiLevel + ")");

        Activity activity = null;
        try {
            android.content.Intent launch = new android.content.Intent(getTargetContext(), MainActivity.class);
            launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    | android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK);
            activity = startActivitySync(launch);
            check(activity instanceof MainActivity, "instrumentation launches the real MainActivity");
            Activity mainActivity = activity;
            android.view.View[] controls = new android.view.View[4];
            long startupDeadline = android.os.SystemClock.uptimeMillis() + 10000L;
            while (android.os.SystemClock.uptimeMillis() < startupDeadline) {
                runOnMainSync(() -> {
                    android.view.View root = mainActivity.getWindow().getDecorView();
                    controls[0] = findViewByContentDescription(root, "Tasks page, selected.");
                    controls[1] = findViewByContentDescription(
                            root, "Web browser page. Switch to web browser and search.");
                    controls[2] = findViewByContentDescription(root, "Browser address and search field");
                    controls[3] = findViewByText(root, "Your tasks");
                });
                if (controls[0] != null && controls[1] != null && controls[2] != null && controls[3] != null) break;
                android.os.SystemClock.sleep(50L);
            }
            check(controls[0] != null && controls[1] != null && controls[2] != null && controls[3] != null,
                    "real MainActivity exposes Tasks/Web navigation and visible task/browser content anchors");

            android.view.View tasksTab = controls[0];
            android.view.View webTab = controls[1];
            android.view.View browserAddress = controls[2];
            android.view.View taskAnchor = controls[3];
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, false,
                    "fresh MainActivity starts on Tasks");

            clickWorkspaceTab(webTab, "Tasks to Web");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, true,
                    "Web tab makes browser content visible");
            awaitMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, true, "Tasks to Web");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, true,
                    "Web workspace remains selected after its transition window");

            clickWorkspaceTab(tasksTab, "Web to Tasks");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, false,
                    "Tasks tab restores task content");
            awaitMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, false, "Web to Tasks");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, false,
                    "Tasks workspace remains selected after its transition window");

            boolean[] webTasksWebClicks = new boolean[3];
            runOnMainSync(() -> {
                webTasksWebClicks[0] = webTab.performClick();
                webTasksWebClicks[1] = tasksTab.performClick();
                webTasksWebClicks[2] = webTab.performClick();
            });
            check(webTasksWebClicks[0] && webTasksWebClicks[1] && webTasksWebClicks[2],
                    "rapid Web-Tasks-Web taps are accepted by the real navigation views");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, true,
                    "rapid Web-Tasks-Web toggle leaves Web visible");
            awaitMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, true,
                    "rapid Web-Tasks-Web");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, true,
                    "rapid Web-Tasks-Web toggle settles on Web without stale visibility");

            boolean[] tasksWebTasksClicks = new boolean[3];
            runOnMainSync(() -> {
                tasksWebTasksClicks[0] = tasksTab.performClick();
                tasksWebTasksClicks[1] = webTab.performClick();
                tasksWebTasksClicks[2] = tasksTab.performClick();
            });
            check(tasksWebTasksClicks[0] && tasksWebTasksClicks[1] && tasksWebTasksClicks[2],
                    "rapid Tasks-Web-Tasks taps are accepted by the real navigation views");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, false,
                    "rapid Tasks-Web-Tasks toggle leaves Tasks visible");
            awaitMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, false,
                    "rapid Tasks-Web-Tasks");
            checkMainActivityWorkspaceMode(taskAnchor, browserAddress, tasksTab, webTab, false,
                    "rapid Tasks-Web-Tasks toggle settles on Tasks without stale visibility");
        } finally {
            if (activity != null && !activity.isFinishing()) {
                Activity closingActivity = activity;
                runOnMainSync(closingActivity::finish);
                waitForIdleSync();
            }
        }
    }

    /** Exercises only the mode controls; this phase never presses Start or opens the task picker. */
    private void focusTimerModeSelectorTapsAndSwipes() throws Exception {
        Activity activity = null;
        try {
            android.content.Intent launch = new android.content.Intent(getTargetContext(), MainActivity.class);
            launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    | android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK);
            activity = startActivitySync(launch);
            check(activity instanceof MainActivity, "mode gesture test launches the real MainActivity");
            Activity mainActivity = activity;
            android.view.View[] controls = new android.view.View[4];
            long deadline = android.os.SystemClock.uptimeMillis() + 10000L;
            while (android.os.SystemClock.uptimeMillis() < deadline) {
                runOnMainSync(() -> {
                    android.view.View root = mainActivity.getWindow().getDecorView();
                    android.view.View selector = findFocusModeSelectorInRoot(root);
                    controls[0] = selector == null ? null : findViewByText(selector, "Stopwatch");
                    controls[1] = selector == null ? null : findViewByText(selector, "Countdown");
                    controls[2] = findViewByContentDescription(root, "Start focus timer");
                    controls[3] = findViewByText(root, "READY WHEN YOU ARE");
                });
                if (controls[0] != null && controls[1] != null
                        && controls[2] != null && controls[3] != null) break;
                android.os.SystemClock.sleep(50L);
            }
            check(controls[0] != null && controls[1] != null
                            && controls[2] != null && controls[3] != null,
                    "real Focus Timer panel exposes mode controls and the idle Start/ready state");
            android.view.View stopwatch = controls[0];
            android.view.View countdown = controls[1];
            android.view.View modeRow = (android.view.View) stopwatch.getParent();
            check(countdown.getParent() == modeRow,
                    "Stopwatch and Countdown are sibling buttons in the real mode selector");
            android.view.View modeSelector = findAncestorWithSimpleName(modeRow, "ModeSelector");
            check(modeSelector != null && modeSelector.getClass().getSimpleName().equals("ModeSelector"),
                    "mode buttons are wrapped by the real Focus ModeSelector that owns horizontal interception");
            android.widget.ScrollView parentScroll = findParentScrollView(modeSelector);
            check(parentScroll != null,
                    "Focus mode selector remains inside the parent Tasks ScrollView");
            // Add scrollable content before any mode tap so the actual controls can be
            // positioned inside the ScrollView viewport, not merely drawn beyond it.
            final android.widget.ScrollView initialParentScroll = parentScroll;
            runOnMainSync(() -> {
                android.view.ViewGroup frame = (android.view.ViewGroup) initialParentScroll.getChildAt(0);
                android.view.ViewGroup content = (android.view.ViewGroup) frame.getChildAt(0);
                android.view.View spacer = new android.view.View(mainActivity);
                content.addView(spacer, new android.widget.LinearLayout.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT, 1200));
                content.requestLayout();
                initialParentScroll.requestLayout();
            });
            waitForIdleSync();
            scrollViewIntoFocus(modeRow);
            scrollDescendantIntoScrollView(parentScroll, countdown);
            scrollDescendantIntoScrollView(parentScroll, stopwatch);
            scrollDescendantIntoScrollView(parentScroll, modeSelector);
            checkFocusModeState(mainActivity, stopwatch, countdown, false,
                    "fresh Focus Timer panel starts in Stopwatch mode");

            String countdownTap = dispatchTap(mainActivity, "Countdown");
            checkFocusModeState(mainActivity, stopwatch, countdown, true,
                    "a real tap selects Countdown (" + countdownTap + ")");
            String stopwatchTap = dispatchTap(mainActivity, "Stopwatch");
            checkFocusModeState(mainActivity, stopwatch, countdown, false,
                    "a real tap selects Stopwatch (" + stopwatchTap + ")");

            modeSelector = findFocusModeSelector(mainActivity);
            stopwatch = findFocusModeButton(modeSelector, "Stopwatch");
            countdown = findFocusModeButton(modeSelector, "Countdown");
            parentScroll = findParentScrollView(modeSelector);
            String leftSwipe = dispatchSwipe(modeSelector, true);
            checkFocusModeState(mainActivity, stopwatch, countdown, true,
                    "a leftward horizontal swipe selects Countdown (" + leftSwipe + ")");
            modeSelector = findFocusModeSelector(mainActivity);
            stopwatch = findFocusModeButton(modeSelector, "Stopwatch");
            countdown = findFocusModeButton(modeSelector, "Countdown");
            parentScroll = findParentScrollView(modeSelector);
            String rightSwipe = dispatchSwipe(modeSelector, false);
            checkFocusModeState(mainActivity, stopwatch, countdown, false,
                    "a rightward horizontal swipe selects Stopwatch (" + rightSwipe + ")");
            // The selector may have moved during horizontal gestures; re-center it
            // before injecting the parent-scroll gesture.
            modeSelector = findFocusModeSelector(mainActivity);
            stopwatch = findFocusModeButton(modeSelector, "Stopwatch");
            countdown = findFocusModeButton(modeSelector, "Countdown");
            parentScroll = findParentScrollView(modeSelector);
            scrollDescendantIntoScrollView(parentScroll, modeSelector);
            boolean[] canScroll = new boolean[2];
            int[] scrollY = new int[2];
            final android.widget.ScrollView scrollForMeasurement = parentScroll;
            runOnMainSync(() -> {
                canScroll[0] = scrollForMeasurement.canScrollVertically(1);
                canScroll[1] = scrollForMeasurement.canScrollVertically(-1);
                scrollY[0] = scrollForMeasurement.getScrollY();
            });
            check(canScroll[0] || canScroll[1],
                    "Tasks workspace has scrollable content for the vertical-gesture regression");
            String verticalScrollTrace = dispatchVerticalScrollSwipe(modeSelector, parentScroll, canScroll[0]);
            long scrollDeadline = android.os.SystemClock.uptimeMillis() + 2000L;
            final android.widget.ScrollView scrollForCurrentPosition = parentScroll;
            do {
                runOnMainSync(() -> scrollY[1] = scrollForCurrentPosition.getScrollY());
                if (canScroll[0] ? scrollY[1] > scrollY[0] : scrollY[1] < scrollY[0]) break;
                android.os.SystemClock.sleep(50L);
            } while (android.os.SystemClock.uptimeMillis() < scrollDeadline);
            check(canScroll[0] ? scrollY[1] > scrollY[0] : scrollY[1] < scrollY[0],
                    "parent Tasks ScrollView scrolls after a vertical Focus-mode drag"
                            + " (startY=" + scrollY[0] + ", endY=" + scrollY[1]
                            + ", canScrollDown=" + canScroll[0] + ", canScrollUp=" + canScroll[1]
                            + ", verticalScrollTrace=" + verticalScrollTrace + ")");
            checkFocusModeState(mainActivity, stopwatch, countdown, false,
                    "a vertical workspace scroll does not change the selected Focus mode");
            modeSelector = findFocusModeSelector(mainActivity);
            stopwatch = findFocusModeButton(modeSelector, "Stopwatch");
            countdown = findFocusModeButton(modeSelector, "Countdown");
            parentScroll = findParentScrollView(modeSelector);
            scrollDescendantIntoScrollView(parentScroll, countdown);
            dispatchVerticalSwipe(countdown);
            checkFocusModeState(mainActivity, stopwatch, countdown, false,
                    "a vertical drag inside Countdown cancels the child click");
            modeSelector = findFocusModeSelector(mainActivity);
            stopwatch = findFocusModeButton(modeSelector, "Stopwatch");
            countdown = findFocusModeButton(modeSelector, "Countdown");
            parentScroll = findParentScrollView(modeSelector);
            scrollDescendantIntoScrollView(parentScroll, countdown);
            String countdownAfterVerticalDrag = dispatchTap(mainActivity, "Countdown");
            checkFocusModeState(mainActivity, stopwatch, countdown, true,
                    "a tap still works after a rejected vertical drag (" + countdownAfterVerticalDrag + ")");
            modeSelector = findFocusModeSelector(mainActivity);
            stopwatch = findFocusModeButton(modeSelector, "Stopwatch");
            countdown = findFocusModeButton(modeSelector, "Countdown");
            parentScroll = findParentScrollView(modeSelector);
            scrollDescendantIntoScrollView(parentScroll, stopwatch);
            dispatchVerticalSwipe(stopwatch);
            checkFocusModeState(mainActivity, stopwatch, countdown, true,
                    "a vertical drag inside Stopwatch cancels the child click");
            modeSelector = findFocusModeSelector(mainActivity);
            stopwatch = findFocusModeButton(modeSelector, "Stopwatch");
            countdown = findFocusModeButton(modeSelector, "Countdown");
            parentScroll = findParentScrollView(modeSelector);
            scrollDescendantIntoScrollView(parentScroll, stopwatch);
            String stopwatchAfterVerticalDrag = dispatchTap(mainActivity, "Stopwatch");
            checkFocusModeState(mainActivity, stopwatch, countdown, false,
                    "a vertical drag does not disable subsequent taps (" + stopwatchAfterVerticalDrag + ")");
        } finally {
            if (activity != null && !activity.isFinishing()) {
                Activity closingActivity = activity;
                runOnMainSync(closingActivity::finish);
                waitForIdleSync();
            }
        }
    }

    private android.view.View findViewByContentDescription(android.view.View root, String expected) {
        CharSequence description = root.getContentDescription();
        if (description != null && expected.contentEquals(description)) return root;
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int index = 0; index < group.getChildCount(); index++) {
                android.view.View match = findViewByContentDescription(group.getChildAt(index), expected);
                if (match != null) return match;
            }
        }
        return null;
    }

    private android.view.View findFocusModeSelector(Activity activity) throws Exception {
        android.view.View[] selector = new android.view.View[1];
        runOnMainSync(() -> selector[0] = findFocusModeSelectorInRoot(
                activity.getWindow().getDecorView()));
        check(selector[0] != null,
                "current visible Stopwatch and Countdown resolve from one active ModeSelector");
        return selector[0];
    }

    private android.view.View findFocusModeSelectorInRoot(android.view.View root) {
        if (root == null) return null;
        if ("ModeSelector".equals(root.getClass().getSimpleName())) {
            android.view.View stopwatch = findViewByText(root, "Stopwatch");
            android.view.View countdown = findViewByText(root, "Countdown");
            if (isReadyFocusModeButton(stopwatch) && isReadyFocusModeButton(countdown)
                    && stopwatch.getParent() == countdown.getParent()
                    && findAncestorWithSimpleName(stopwatch, "ModeSelector") == root
                    && findAncestorWithSimpleName(countdown, "ModeSelector") == root) {
                return root;
            }
        }
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int index = group.getChildCount() - 1; index >= 0; index--) {
                android.view.View match = findFocusModeSelectorInRoot(group.getChildAt(index));
                if (match != null) return match;
            }
        }
        return null;
    }

    private boolean isReadyFocusModeButton(android.view.View view) {
        return view != null && view.isShown() && view.isAttachedToWindow()
                && view.isEnabled() && view.isClickable() && view.hasOnClickListeners();
    }

    private android.view.View findFocusModeButton(android.view.View selector, String label) {
        android.view.View button = selector == null ? null : findViewByText(selector, label);
        check(isReadyFocusModeButton(button)
                        && findAncestorWithSimpleName(button, "ModeSelector") == selector,
                "current " + label + " button belongs to the active ModeSelector");
        return button;
    }

    private android.view.View findVisibleTextView(android.view.View root, String expected) {
        if (root == null) return null;
        if (root instanceof android.widget.TextView) {
            CharSequence text = ((android.widget.TextView) root).getText();
            if (text != null && expected.contentEquals(text)
                    && root.isShown() && root.isAttachedToWindow()) return root;
        }
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int index = group.getChildCount() - 1; index >= 0; index--) {
                android.view.View match = findVisibleTextView(group.getChildAt(index), expected);
                if (match != null) return match;
            }
        }
        return null;
    }

    private android.view.View findViewByText(android.view.View root, String expected) {
        if (root instanceof android.widget.TextView) {
            CharSequence text = ((android.widget.TextView) root).getText();
            if (text != null && expected.contentEquals(text)) return root;
        }
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int index = 0; index < group.getChildCount(); index++) {
                android.view.View match = findViewByText(group.getChildAt(index), expected);
                if (match != null) return match;
            }
        }
        return null;
    }

    private void scrollDescendantIntoScrollView(android.widget.ScrollView scrollView,
                                                   android.view.View descendant) throws Exception {
        int[] targetHeight = new int[1];
        runOnMainSync(() -> {
            targetHeight[0] = descendant.getHeight();
            android.graphics.Rect target = new android.graphics.Rect(
                    0, 0, descendant.getWidth(), descendant.getHeight());
            scrollView.offsetDescendantRectToMyCoords(descendant, target);
            int viewportHeight = Math.max(1,
                    scrollView.getHeight() - scrollView.getPaddingTop() - scrollView.getPaddingBottom());
            int contentHeight = scrollView.getChildAt(0).getHeight();
            int maximumScroll = Math.max(0, contentHeight - viewportHeight);
            int desiredScroll = target.centerY() - viewportHeight / 2;
            scrollView.scrollTo(0, Math.max(0, Math.min(desiredScroll, maximumScroll)));
        });
        waitForIdleSync();
        waitForScrollPositionToSettle(scrollView);
        android.graphics.Rect parentBounds = visibleBounds(scrollView);
        android.graphics.Rect targetBounds = visibleBounds(descendant);
        int[] actualScroll = new int[1];
        runOnMainSync(() -> actualScroll[0] = scrollView.getScrollY());
        check(targetBounds.height() >= targetHeight[0]
                        && targetBounds.top >= parentBounds.top
                        && targetBounds.bottom <= parentBounds.bottom,
                "Focus control is fully inside the parent Tasks ScrollView before touch injection"
                        + " (target=" + targetBounds.toShortString()
                        + ", parent=" + parentBounds.toShortString()
                        + ", scrollY=" + actualScroll[0] + ")");
    }

    private void waitForScrollPositionToSettle(android.widget.ScrollView scrollView) throws Exception {
        int previousScrollY = Integer.MIN_VALUE;
        int stableSamples = 0;
        int lastScrollY = 0;
        long deadline = android.os.SystemClock.uptimeMillis() + 2000L;
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            int[] currentScrollY = new int[1];
            runOnMainSync(() -> currentScrollY[0] = scrollView.getScrollY());
            lastScrollY = currentScrollY[0];
            if (lastScrollY == previousScrollY) {
                stableSamples++;
                // A ScrollView can reach a pixel-stable edge while its OverScroller
                // is still finishing a fling/springback. Keep the window long enough
                // that the next independent DOWN is not mistaken for that old drag.
                if (stableSamples >= 8) {
                    waitForIdleSync();
                    return;
                }
            } else {
                stableSamples = 0;
            }
            previousScrollY = lastScrollY;
            android.os.SystemClock.sleep(50L);
        }
        check(stableSamples >= 8,
                "parent Tasks ScrollView settles before child tap injection"
                        + " (lastScrollY=" + lastScrollY + ", stableSamples=" + stableSamples + ")");
    }

    private void scrollViewIntoFocus(android.view.View view) throws Exception {
        int[] size = new int[2];
        long deadline = android.os.SystemClock.uptimeMillis() + 2000L;
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            runOnMainSync(() -> {
                size[0] = view.getWidth();
                size[1] = view.getHeight();
            });
            if (size[0] > 0 && size[1] > 0) break;
            android.os.SystemClock.sleep(50L);
        }
        check(size[0] > 0 && size[1] > 0, "real mode selector has completed layout before touch injection");
        runOnMainSync(() -> view.requestRectangleOnScreen(
                new android.graphics.Rect(0, 0, size[0], size[1]), true));
        waitForIdleSync();
        deadline = android.os.SystemClock.uptimeMillis() + 2000L;
        android.graphics.Rect bounds;
        do {
            bounds = visibleBounds(view);
            if (bounds.width() >= size[0] && bounds.height() >= size[1]) break;
            android.os.SystemClock.sleep(50L);
        } while (android.os.SystemClock.uptimeMillis() < deadline);
        check(bounds.width() >= size[0] && bounds.height() >= size[1],
                "real mode selector is fully visible for injected pointer gestures");
    }

    private android.graphics.Rect visibleBounds(android.view.View view) throws Exception {
        android.graphics.Rect[] bounds = {new android.graphics.Rect()};
        int[] rootLocation = new int[2];
        runOnMainSync(() -> {
            // getGlobalVisibleRect is relative to the root view, but UiAutomation
            // injects MotionEvents in screen coordinates. Translate before using
            // these bounds to select tap/drag coordinates.
            view.getGlobalVisibleRect(bounds[0]);
            android.view.View rootView = view.getRootView();
            if (rootView != null) rootView.getLocationOnScreen(rootLocation);
        });
        bounds[0].offset(rootLocation[0], rootLocation[1]);
        return bounds[0];
    }

    private String findFocusStatusText(android.view.View root) {
        String[] statuses = {
                "READY WHEN YOU ARE", "TARGET DURATION", "TIME REMAINING",
                "FOCUS IN PROGRESS", "PAUSED · READY TO RESUME", "SESSION COMPLETE"
        };
        for (String status : statuses) {
            if (findViewByText(root, status) != null) return status;
        }
        return "none";
    }

    private void checkFocusModeState(Activity activity, android.view.View stopwatch,
            android.view.View countdown, boolean countdownExpected, String message) throws Exception {
        boolean[] selected = new boolean[2];
        boolean[] idleState = new boolean[1];
        String[] actualStatus = new String[1];
        String[] startDescription = new String[1];
        String[] startText = new String[1];
        runOnMainSync(() -> {
            android.view.View root = activity.getWindow().getDecorView();
            android.view.View selector = findFocusModeSelectorInRoot(root);
            android.view.View currentStopwatch = selector == null ? null : findViewByText(selector, "Stopwatch");
            android.view.View currentCountdown = selector == null ? null : findViewByText(selector, "Countdown");
            selected[0] = currentStopwatch != null && currentStopwatch.isSelected();
            selected[1] = currentCountdown != null && currentCountdown.isSelected();
            android.view.View start = findViewByContentDescription(root, "Start focus timer");
            String expectedStatus = countdownExpected ? "TARGET DURATION" : "READY WHEN YOU ARE";
            android.view.View status = findViewByText(root, expectedStatus);
            idleState[0] = start != null && status != null;
            actualStatus[0] = findFocusStatusText(root);
            startDescription[0] = start == null ? "none" : String.valueOf(start.getContentDescription());
            startText[0] = start instanceof android.widget.TextView
                    ? String.valueOf(((android.widget.TextView) start).getText()) : "none";
        });
        String observed = "actual Stopwatch=" + selected[0] + ", Countdown=" + selected[1]
                + ", idle=" + idleState[0] + ", status=" + actualStatus[0]
                + ", startDescription=" + startDescription[0] + ", startText=" + startText[0];
        check(selected[0] == !countdownExpected && selected[1] == countdownExpected,
                message + ": exactly the expected mode is selected (" + observed + ")");
        check(idleState[0], message + ": Start remains available and the timer stays idle (" + observed + ")");
    }

    private String dispatchTap(Activity activity, String label) throws Exception {
        android.view.View[] target = new android.view.View[1];
        runOnMainSync(() -> {
            android.view.View selector = findFocusModeSelectorInRoot(
                    activity.getWindow().getDecorView());
            target[0] = selector == null ? null : findViewByText(selector, label);
        });
        check(isReadyFocusModeButton(target[0])
                        && findAncestorWithSimpleName(target[0], "ModeSelector") != null,
                "current visible " + label + " button belongs to an active ModeSelector");
        return dispatchTap(target[0]);
    }

    private String dispatchTap(android.view.View view) throws Exception {
        android.view.View modeSelector = findAncestorWithSimpleName(view, "ModeSelector");
        android.widget.ScrollView parentScroll = modeSelector == null
                ? null : findParentScrollView(modeSelector);
        if (parentScroll != null) waitForScrollPositionToSettle(parentScroll);
        android.graphics.Rect bounds = stableVisibleBounds(view);
        check(bounds.width() > 0 && bounds.height() > 0, "tap target has stable visible screen bounds");
        String target = describeTouchTarget(view, bounds);
        float x = bounds.centerX();
        float y = bounds.centerY();
        StringBuilder touchTrace = new StringBuilder();
        java.util.ArrayList<android.view.View> tracedViews = new java.util.ArrayList<>();
        android.view.View traceRoot = parentScroll != null ? parentScroll
                : modeSelector != null ? modeSelector : view;
        runOnMainSync(() -> attachTouchTraceListeners(traceRoot, "tap", touchTrace, tracedViews));
        long downTime = android.os.SystemClock.uptimeMillis();
        try {
            injectTouchSequence(PlatformTouchSequence.tap(x, y, downTime), downTime);
            waitForIdleSync();
        } finally {
            runOnMainSync(() -> {
                for (android.view.View tracedView : tracedViews) tracedView.setOnTouchListener(null);
            });
        }
        String[] capturedTouchTrace = new String[1];
        runOnMainSync(() -> capturedTouchTrace[0] = touchTrace.toString());
        return target + " tapCenter=(" + x + "," + y + ") source=UiAutomation/finger"
                + " events=[" + capturedTouchTrace[0] + "]";
    }

    private String dispatchSwipe(android.view.View view, boolean left) throws Exception {
        android.graphics.Rect bounds = stableVisibleBounds(view);
        check(bounds.width() > 0 && bounds.height() > 0, "swipe target has stable visible screen bounds");
        String target = describeTouchTarget(view, bounds);
        StringBuilder touchTrace = new StringBuilder();
        java.util.ArrayList<android.view.View> tracedViews = new java.util.ArrayList<>();
        runOnMainSync(() -> attachTouchTraceListeners(view, "selector", touchTrace, tracedViews));
        float startX = left ? bounds.left + bounds.width() * 0.82f : bounds.left + bounds.width() * 0.18f;
        float endX = left ? bounds.left + bounds.width() * 0.18f : bounds.left + bounds.width() * 0.82f;
        float y = bounds.centerY();
        try {
            injectDrag(startX, y, endX, y);
        } finally {
            runOnMainSync(() -> {
                for (android.view.View tracedView : tracedViews) tracedView.setOnTouchListener(null);
            });
        }
        String[] capturedTouchTrace = new String[1];
        runOnMainSync(() -> capturedTouchTrace[0] = touchTrace.toString());
        check(capturedTouchTrace[0] != null && !capturedTouchTrace[0].isEmpty(),
                "horizontal swipe delivers touchscreen events to the ModeSelector or descendants (" + target + ")");
        return (left ? "leftward" : "rightward") + " swipe " + target
                + " start=(" + startX + "," + y + ") end=(" + endX + "," + y + ")"
                + " events=[" + capturedTouchTrace[0] + "]";
    }

    private void attachTouchTraceListeners(android.view.View view, String label,
                                            StringBuilder trace,
                                            java.util.List<android.view.View> tracedViews) {
        view.setOnTouchListener((targetView, event) -> {
            appendTouchTrace(trace, label, targetView, event);
            return false;
        });
        tracedViews.add(view);
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                attachTouchTraceListeners(group.getChildAt(index), label + "." + index,
                        trace, tracedViews);
            }
        }
    }

    private void appendTouchTrace(StringBuilder trace, String target, android.view.View targetView,
                                  android.view.MotionEvent event) {
        if (trace.length() > 0) trace.append(';');
        String label = targetView instanceof android.widget.TextView
                ? String.valueOf(((android.widget.TextView) targetView).getText())
                : targetView.getClass().getSimpleName();
        int pointerIndex = event.getPointerCount() == 0 ? 0
                : Math.min(event.getActionIndex(), event.getPointerCount() - 1);
        trace.append(target).append(':').append(android.view.MotionEvent.actionToString(event.getActionMasked()))
                .append(" label=").append(label)
                .append(" pointerCount=").append(event.getPointerCount());
        if (event.getPointerCount() > 0) {
            trace.append(" pointerId=").append(event.getPointerId(pointerIndex))
                    .append(" toolType=").append(event.getToolType(pointerIndex));
        }
        trace.append(" local=(").append(event.getX()).append(',').append(event.getY()).append(')')
                .append(" raw=(").append(event.getRawX()).append(',').append(event.getRawY()).append(')')
                .append(" source=").append(event.getSource())
                .append(" eventTime=").append(event.getEventTime());
        if (targetView instanceof android.widget.ScrollView) {
            trace.append(" scrollY=").append(((android.widget.ScrollView) targetView).getScrollY());
        }
    }

    private void dispatchVerticalSwipe(android.view.View view) throws Exception {
        android.graphics.Rect bounds = stableVisibleBounds(view);
        check(bounds.width() > 0 && bounds.height() > 0, "vertical-gesture target has stable visible screen bounds");
        StringBuilder touchTrace = new StringBuilder();
        runOnMainSync(() -> view.setOnTouchListener((targetView, event) -> {
            appendTouchTrace(touchTrace, "vertical", targetView, event);
            return false;
        }));
        try {
            float distance = verticalGestureDistance(view, bounds);
            injectDrag(bounds.centerX(), bounds.centerY() - distance / 2f,
                    bounds.centerX(), bounds.centerY() + distance / 2f);
        } finally {
            runOnMainSync(() -> view.setOnTouchListener(null));
        }
        String[] capturedTouchTrace = new String[1];
        runOnMainSync(() -> capturedTouchTrace[0] = touchTrace.toString());
        check(capturedTouchTrace[0] != null && !capturedTouchTrace[0].isEmpty(),
                "vertical drag delivers touchscreen events to target ("
                        + view.getClass().getSimpleName() + ")");
    }

    private android.view.View findAncestorWithSimpleName(android.view.View view, String simpleName) {
        android.view.View current = view;
        while (current != null) {
            if (simpleName.equals(current.getClass().getSimpleName())) return current;
            android.view.ViewParent parent = current.getParent();
            current = parent instanceof android.view.View ? (android.view.View) parent : null;
        }
        return null;
    }

    private android.widget.ScrollView findParentScrollView(android.view.View view) {
        android.view.ViewParent parent = view.getParent();
        while (parent != null) {
            if (parent instanceof android.widget.ScrollView) {
                return (android.widget.ScrollView) parent;
            }
            parent = parent.getParent();
        }
        return null;
    }

    private float verticalGestureDistance(android.view.View view, android.graphics.Rect bounds) {
        int touchSlop = android.view.ViewConfiguration.get(view.getContext()).getScaledTouchSlop();
        // A fixed 48px cap can be below touch slop on high-density emulators
        // (for example, 16dp at 3x density), so ScrollView treats the gesture as a tap.
        float distance = Math.min(bounds.height() * 0.70f, Math.max(48f, touchSlop * 4f));
        if (distance <= touchSlop) {
            throw new AssertionError("vertical gesture distance must exceed scaled touch slop"
                    + " (distance=" + distance + ", touchSlop=" + touchSlop
                    + ", boundsHeight=" + bounds.height() + ")");
        }
        return distance;
    }

    private String dispatchVerticalScrollSwipe(android.view.View view,
                                                android.widget.ScrollView parentScroll,
                                                boolean fingerMovesUp) throws Exception {
        android.graphics.Rect bounds = stableVisibleBounds(view);
        check(bounds.width() > 0 && bounds.height() > 0,
                "vertical-scroll target has stable visible screen bounds");
        float distance = verticalGestureDistance(view, bounds);
        float startY = fingerMovesUp
                ? bounds.centerY() + distance / 2f
                : bounds.centerY() - distance / 2f;
        float endY = fingerMovesUp
                ? bounds.centerY() - distance / 2f
                : bounds.centerY() + distance / 2f;
        StringBuilder selectorTrace = new StringBuilder();
        // A delivered parent MOVE is rendered as parent-scroll:ACTION_MOVE by appendTouchTrace().
        // Keeping this label explicit lets the source guard catch regressions in ScrollView tracing.
        StringBuilder ancestorTrace = new StringBuilder();
        java.util.ArrayList<android.view.View> tracedViews = new java.util.ArrayList<>();
        java.util.ArrayList<android.view.View> tracedAncestors = new java.util.ArrayList<>();
        int[] parentScrollY = new int[2];
        String[] parentScrollState = new String[1];
        runOnMainSync(() -> {
            android.graphics.Rect parentScrollBounds = new android.graphics.Rect();
            int[] parentScrollLocation = new int[2];
            parentScroll.getGlobalVisibleRect(parentScrollBounds);
            android.view.View rootView = parentScroll.getRootView();
            int[] rootLocation = new int[2];
            if (rootView != null) rootView.getLocationOnScreen(rootLocation);
            parentScrollBounds.offset(rootLocation[0], rootLocation[1]);
            parentScroll.getLocationOnScreen(parentScrollLocation);
            parentScrollState[0] = "parentScrollState={enabled=" + parentScroll.isEnabled()
                    + ", shown=" + parentScroll.isShown()
                    + ", clickable=" + parentScroll.isClickable()
                    + ", visibility=" + parentScroll.getVisibility()
                    + ", locationOnScreen=(" + parentScrollLocation[0] + "," + parentScrollLocation[1] + ")"
                    + ", visibleBounds=" + parentScrollBounds.toShortString()
                    + ", height=" + parentScroll.getHeight()
                    + ", childCount=" + parentScroll.getChildCount()
                    + ", canScrollDown=" + parentScroll.canScrollVertically(1) + "}";
            parentScrollY[0] = parentScroll.getScrollY();
            attachTouchTraceListeners(view, "vertical-selector", selectorTrace, tracedViews);
            android.view.ViewParent parent = view.getParent();
            int ancestorIndex = 0;
            while (parent instanceof android.view.View) {
                android.view.View ancestor = (android.view.View) parent;
                final String label = ancestor == parentScroll ? "parent-scroll"
                        : "ancestor-" + ancestorIndex + "-" + ancestor.getClass().getSimpleName();
                ancestor.setOnTouchListener((targetView, event) -> {
                    appendTouchTrace(ancestorTrace, label, targetView, event);
                    return false;
                });
                tracedAncestors.add(ancestor);
                parent = ancestor.getParent();
                ancestorIndex += 1;
            }
        });
        try {
            injectDrag(bounds.centerX(), startY, bounds.centerX(), endY);
        } finally {
            runOnMainSync(() -> {
                for (android.view.View tracedView : tracedViews) tracedView.setOnTouchListener(null);
                for (android.view.View tracedAncestor : tracedAncestors) tracedAncestor.setOnTouchListener(null);
                parentScrollY[1] = parentScroll.getScrollY();
            });
        }
        String[] traces = new String[1];
        runOnMainSync(() -> traces[0] = "selector=[" + selectorTrace + "] ancestors=[" + ancestorTrace + "]");
        return parentScrollState[0] + " " + traces[0] + " start=(" + bounds.centerX() + "," + startY + ")"
                + " end=(" + bounds.centerX() + "," + endY + ")"
                + " parentScrollYBefore=" + parentScrollY[0]
                + " parentScrollYAfter=" + parentScrollY[1];
    }

    private android.graphics.Rect stableVisibleBounds(android.view.View view) throws Exception {
        android.graphics.Rect previous = null;
        android.graphics.Rect current = new android.graphics.Rect();
        int stableSamples = 0;
        long deadline = android.os.SystemClock.uptimeMillis() + 2000L;
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            android.graphics.Rect[] visible = {new android.graphics.Rect()};
            int[] screenLocation = new int[2];
            int[] size = new int[2];
            runOnMainSync(() -> {
                // getGlobalVisibleRect is used only to prove that the whole
                // target is visible. Its root/window coordinate space can
                // differ from UiAutomation's screen coordinate space when
                // Android applies edge-to-edge/window insets. Inject using
                // getLocationOnScreen, which is the coordinate space expected
                // by UiAutomation, rather than translating the global rect.
                view.getGlobalVisibleRect(visible[0]);
                view.getLocationOnScreen(screenLocation);
                size[0] = view.getWidth();
                size[1] = view.getHeight();
            });
            if (size[0] > 0 && size[1] > 0
                    && visible[0].width() >= size[0] && visible[0].height() >= size[1]) {
                current.set(screenLocation[0], screenLocation[1],
                        screenLocation[0] + size[0], screenLocation[1] + size[1]);
            } else {
                current.setEmpty();
            }
            if (current.width() > 0 && current.height() > 0
                    && previous != null && current.equals(previous)) {
                stableSamples++;
                if (stableSamples >= 2) return current;
            } else {
                stableSamples = 0;
            }
            previous = new android.graphics.Rect(current);
            android.os.SystemClock.sleep(50L);
        }
        throw new AssertionError("touch target screen bounds did not stabilize or were not fully visible: "
                + current.toShortString());
    }

    private String describeTouchTarget(android.view.View view, android.graphics.Rect bounds) throws Exception {
        int[] location = new int[2];
        boolean[] state = new boolean[5];
        String[] label = new String[1];
        runOnMainSync(() -> {
            view.getLocationOnScreen(location);
            state[0] = view.isShown();
            state[1] = view.isEnabled();
            state[2] = view.isClickable();
            state[3] = view.isAttachedToWindow();
            state[4] = view.hasOnClickListeners();
            if (view instanceof android.widget.TextView) {
                CharSequence text = ((android.widget.TextView) view).getText();
                label[0] = text == null ? "" : text.toString();
            }
        });
        return "target=" + label[0] + " bounds=" + bounds.toShortString()
                + " locationOnScreen=(" + location[0] + "," + location[1] + ")"
                + " shown=" + state[0] + " enabled=" + state[1] + " clickable=" + state[2]
                + " attached=" + state[3] + " hasClickListener=" + state[4];
    }

    private void injectDrag(float startX, float startY, float endX, float endY) throws Exception {
        long downTime = android.os.SystemClock.uptimeMillis();
        injectTouchSequence(PlatformTouchSequence.swipe(startX, startY, endX, endY,
                downTime, PlatformTouchSequence.DEFAULT_SWIPE_DURATION_MS), downTime);
    }

    private void injectTouchSequence(java.util.List<PlatformTouchSequence.Sample> samples,
                                     long downTime) throws Exception {
        android.app.UiAutomation automation = getUiAutomation();
        boolean adoptedShellIdentity = false;
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            automation.adoptShellPermissionIdentity("android.permission.INJECT_EVENTS");
            adoptedShellIdentity = true;
            marker("touch injection adopted shell INJECT_EVENTS identity");
        }
        try {
            for (PlatformTouchSequence.Sample sample : samples) {
                long delayMs = PlatformTouchSequence.delayUntil(
                        sample.eventTime, android.os.SystemClock.uptimeMillis());
                if (delayMs > 0L) android.os.SystemClock.sleep(delayMs);
                android.view.MotionEvent event = android.view.MotionEvent.obtain(
                        downTime, sample.eventTime, sample.action, sample.x, sample.y, 0);
                event.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
                // UiAutomation injects onto the default display; setDisplayId is hidden API.
                try {
                    boolean injected;
                    if (android.os.Build.VERSION.SDK_INT >= 29) {
                        injected = automation.injectInputEvent(event, true);
                    } else {
                        sendPointerSync(event);
                        injected = true;
                    }
                    check(injected, "touch event was accepted by UiAutomation (action=" + sample.action
                            + ", x=" + sample.x + ", y=" + sample.y + ")");
                } finally {
                    event.recycle();
                }
            }
        } finally {
            if (adoptedShellIdentity) automation.dropShellPermissionIdentity();
        }
        waitForIdleSync();
    }

    private void injectPointerEvent(int action, long downTime, long eventTime, float x, float y)
            throws Exception {
        android.view.MotionEvent event = android.view.MotionEvent.obtain(
                downTime, eventTime, action, x, y, 0);
        try {
            sendPointerSync(event);
        } finally {
            event.recycle();
        }
    }

    private void clickWorkspaceTab(android.view.View tab, String transition) throws Exception {
        AtomicBoolean clicked = new AtomicBoolean();
        runOnMainSync(() -> clicked.set(tab.performClick()));
        check(clicked.get(), transition + " tab click is accepted by the real MainActivity view");
    }

    private boolean mainActivityWorkspaceModeMatches(android.view.View taskAnchor, android.view.View browserAddress,
            android.view.View tasksTab, android.view.View webTab, boolean webMode) throws Exception {
        boolean[] shown = new boolean[4];
        String[] descriptions = new String[2];
        runOnMainSync(() -> {
            shown[0] = taskAnchor.isShown();
            shown[1] = browserAddress.isShown();
            shown[2] = tasksTab.isShown();
            shown[3] = webTab.isShown();
            descriptions[0] = String.valueOf(tasksTab.getContentDescription());
            descriptions[1] = String.valueOf(webTab.getContentDescription());
        });
        String expectedTasks = webMode
                ? "Tasks page. Switch to tasks and dashboard." : "Tasks page, selected.";
        String expectedWeb = webMode
                ? "Web browser page, selected." : "Web browser page. Switch to web browser and search.";
        return shown[0] == !webMode && shown[1] == webMode && shown[2] && shown[3]
                && expectedTasks.equals(descriptions[0]) && expectedWeb.equals(descriptions[1]);
    }

    private void checkMainActivityWorkspaceMode(android.view.View taskAnchor, android.view.View browserAddress,
            android.view.View tasksTab, android.view.View webTab, boolean webMode, String message) throws Exception {
        check(mainActivityWorkspaceModeMatches(taskAnchor, browserAddress, tasksTab, webTab, webMode),
                message + ": selected accessibility state and visible task/browser content match");
    }

    private void awaitMainActivityWorkspaceMode(android.view.View taskAnchor, android.view.View browserAddress,
            android.view.View tasksTab, android.view.View webTab, boolean webMode, String transition) throws Exception {
        long startedAt = android.os.SystemClock.uptimeMillis();
        long transitionWindowEnds = startedAt + UiMotionPolicy.TAB_SWITCH_MS + 50L;
        long deadline = startedAt + 2000L;
        boolean settled = false;
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            settled = mainActivityWorkspaceModeMatches(taskAnchor, browserAddress, tasksTab, webTab, webMode);
            if (settled && android.os.SystemClock.uptimeMillis() >= transitionWindowEnds) break;
            android.os.SystemClock.sleep(50L);
        }
        check(settled && android.os.SystemClock.uptimeMillis() >= transitionWindowEnds,
                transition + " settles on the expected visible/accessibility state after the tab transition window");
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

        FocusNotificationDiagnostics notificationDiagnostics = new FocusNotificationDiagnostics();
        File root = makeTestDirectory("focus-timer-runtime");
        Context isolated = new IsolatedContext(base, root);
        final int notificationId = 0x44464F43;
        notificationDiagnostics.record("test setup cancel BEGIN id=" + notificationId);
        manager.cancel(notificationId);
        notificationDiagnostics.record("test setup cancel END id=" + notificationId);
        check(awaitNotificationState(manager, notificationId, false),
                "stale focus notification is cleared before the isolated lifecycle test");
        final String taskId = "focus-instrumentation-" + UUID.randomUUID();
        Task task = new Task(taskId, "Focus instrumentation task", null, "medium", false,
                "2026-10-30T18:00:00Z", "2026-10-30T18:00:00Z");
        Task alternateTask = new Task(taskId + "-alternate", "Alternate focus task", null, "medium", false,
                "2026-10-30T18:00:00Z", "2026-10-30T18:00:00Z");
        try {
            EncryptedTaskStore taskStore = new EncryptedTaskStore(isolated);
            check(taskStore.load().isEmpty(), "isolated task store is verified empty before the test task is saved");
            taskStore.save(Arrays.asList(task, alternateTask));
            File taskSnapshot = new File(isolated.getFilesDir(), "tasks.enc");
            byte[] taskBytesBefore = readFile(taskSnapshot);

            TaskFocusSessionRuntime runtime = new TaskFocusSessionRuntime(isolated);
            check(runtime.restoreAfterProcessStart(Collections.singletonList(task)) == null,
                    "first focus runtime starts with no saved session and does not auto-start");
            notificationDiagnostics.record("startFromUserAction BEGIN; coordinator order: persist -> notify");
            TaskFocusSessionCoordinator.Snapshot started = runtime.startFromUserAction(
                    task.id, task.title, TaskFocusTimer.Mode.COUNTDOWN, 60_000L);
            notificationDiagnostics.record("startFromUserAction END notificationPublished="
                    + (started != null && started.notificationPublished));
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
            notificationDiagnostics.record("restore running BEGIN; fresh-runtime coordinator order: cancel -> notify");
            TaskFocusSessionCoordinator.Snapshot restored =
                    restoredRuntime.restoreAfterProcessStart(Arrays.asList(task, alternateTask));
            notificationDiagnostics.record("restore running END notificationPublished="
                    + (restored != null && restored.notificationPublished));
            check(restored != null && restored.isRunning() && restored.restored,
                    "a still-existing task restores its persisted running focus session");
            check(awaitNotificationState(manager, notificationId, true),
                    "restoring an eligible running session republishes its progress notification");

            // Keep a second runtime on the old task identity. Activity onResume can have a
            // previously-created runtime too; its reconciliation must reload the latest durable
            // focus record instead of republishing a cached task title.
            TaskFocusSessionRuntime staleRuntime = new TaskFocusSessionRuntime(isolated);
            notificationDiagnostics.record("stale-runtime restore BEGIN; fresh-runtime coordinator order: cancel -> notify");
            TaskFocusSessionCoordinator.Snapshot staleRestored =
                    staleRuntime.restoreAfterProcessStart(Arrays.asList(task, alternateTask));
            notificationDiagnostics.record("stale-runtime restore END notificationPublished="
                    + (staleRestored != null && staleRestored.notificationPublished));
            check(staleRestored != null && staleRestored.isRunning()
                            && task.id.equals(staleRestored.timer.taskId()),
                    "a second runtime starts with the same persisted task identity");

            notificationDiagnostics.record("pauseFromUserAction BEGIN; coordinator order on presentation change: persist -> cancel -> notify");
            TaskFocusSessionCoordinator.Snapshot paused = restoredRuntime.pauseFromUserAction();
            notificationDiagnostics.record("pauseFromUserAction END notificationPublished="
                    + (paused != null && paused.notificationPublished));
            check(paused != null && paused.isPaused(),
                    "Pause durably changes the focus session to PAUSED");
            checkPausedNotification(manager, notificationId, task.title, "pausing", notificationDiagnostics);

            notificationDiagnostics.record("switchTaskWhilePaused BEGIN; coordinator order on identity change: persist -> cancel -> notify");
            TaskFocusSessionCoordinator.Snapshot switched =
                    restoredRuntime.switchTaskWhilePausedFromUserAction(
                            alternateTask.id, alternateTask.title);
            notificationDiagnostics.record("switchTaskWhilePaused END notificationPublished="
                    + (switched != null && switched.notificationPublished));
            check(switched != null && switched.isPaused()
                            && alternateTask.id.equals(switched.timer.taskId()),
                    "choosing task B changes the paused session identity without resuming it");
            check(switched.notificationPublished,
                    "switching a paused session reports successful notification publication");

            notificationDiagnostics.record("stale-runtime reconcile BEGIN; identity change coordinator order: cancel -> notify");
            TaskFocusSessionCoordinator.Snapshot reconciledStaleRuntime =
                    staleRuntime.reconcileTasks(Arrays.asList(task, alternateTask));
            notificationDiagnostics.record("stale-runtime reconcile END notificationPublished="
                    + (reconciledStaleRuntime != null && reconciledStaleRuntime.notificationPublished));
            check(reconciledStaleRuntime != null && reconciledStaleRuntime.isPaused()
                            && alternateTask.id.equals(reconciledStaleRuntime.timer.taskId())
                            && reconciledStaleRuntime.restored,
                    "a stale runtime reloads the switched task ID before republishing on lifecycle reconciliation");
            TaskFocusTimer persistedSwitch = new TaskFocusTimerStore(isolated).load(
                    android.os.SystemClock.elapsedRealtime(), System.currentTimeMillis(), -1);
            check(persistedSwitch != null && persistedSwitch.isPaused()
                            && alternateTask.id.equals(persistedSwitch.taskId()),
                    "the encrypted focus record durably stores the newly selected task ID");
            byte[] switchedFocusCiphertext = readFile(focusFile);
            check(!new String(switchedFocusCiphertext, StandardCharsets.ISO_8859_1).contains(taskId)
                            && !new String(switchedFocusCiphertext, StandardCharsets.ISO_8859_1)
                                    .contains(alternateTask.id),
                    "the switched task identity remains protected inside the encrypted focus record");
            checkPausedNotification(manager, notificationId, alternateTask.title,
                    "reconciling a stale runtime after a paused task switch", notificationDiagnostics);

            TaskFocusSessionRuntime pausedAfterProcessRestart = new TaskFocusSessionRuntime(isolated);
            notificationDiagnostics.record("restore paused BEGIN; fresh-runtime coordinator order: cancel -> notify");
            TaskFocusSessionCoordinator.Snapshot restoredPaused =
                    pausedAfterProcessRestart.restoreAfterProcessStart(Arrays.asList(task, alternateTask));
            notificationDiagnostics.record("restore paused END notificationPublished="
                    + (restoredPaused != null && restoredPaused.notificationPublished));
            check(restoredPaused != null && restoredPaused.isPaused() && restoredPaused.restored
                            && alternateTask.id.equals(restoredPaused.timer.taskId()),
                    "the switched task ID survives process recreation while the session remains paused");
            check(restoredPaused.notificationPublished,
                    "restoring a paused session reports successful notification publication");
            checkPausedNotification(manager, notificationId, alternateTask.title,
                    "restoring a paused session", notificationDiagnostics);

            notificationDiagnostics.record("resumeFromUserAction BEGIN; coordinator order on presentation change: persist -> cancel -> notify");
            TaskFocusSessionCoordinator.Snapshot resumed =
                    pausedAfterProcessRestart.resumeFromUserAction(alternateTask.id, alternateTask.title);
            notificationDiagnostics.record("resumeFromUserAction END notificationPublished="
                    + (resumed != null && resumed.notificationPublished));
            check(resumed != null && resumed.isRunning()
                            && alternateTask.id.equals(resumed.timer.taskId()),
                    "Resume restores monotonic state under task B's identity");
            android.app.Notification resumedNotification =
                    awaitNotificationTitle(manager, notificationId, alternateTask.title);
            check(resumed.notificationPublished && resumedNotification != null,
                    "resuming after task switch publishes task B's notification"
                            + " (published=" + resumed.notificationPublished
                            + ", observed=" + describeNotification(resumedNotification) + ")");
            notificationDiagnostics.record("finishFromUserAction BEGIN; coordinator order: persist -> cancel");
            TaskFocusSessionCoordinator.Snapshot finished = pausedAfterProcessRestart.finishFromUserAction();
            notificationDiagnostics.record("finishFromUserAction END");
            check(finished != null && finished.isFinished(),
                    "Finish durably ends the focus session without completing the task");
            check(awaitNotificationState(manager, notificationId, false),
                    "Finish cancels only the focus notification");
            check(taskStore.load().size() == 2
                            && taskStore.load().get(0).id.equals(task.id)
                            && taskStore.load().get(1).id.equals(alternateTask.id),
                    "focus timer lifecycle preserves both task records without modifying task data");

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
            // The CI runner starts ten instrumentation processes back-to-back. Wait until
            // NotificationManager has processed this run's cancellation before the next
            // process can publish the same stable ID, avoiding a stale cross-process cancel.
            awaitNotificationState(manager, notificationId, false);
            deleteTree(root);
        }
    }

    /** Bounded, in-memory trace; expensive platform snapshots are taken only for a failed assertion. */
    private static final class FocusNotificationDiagnostics {
        private static final int MAX_EVENTS = 24;
        private static final int MAX_ACTIVE_NOTIFICATIONS = 12;
        private static final int MAX_OUTPUT_CHARS = 8192;
        private final java.util.ArrayList<String> events = new java.util.ArrayList<>();

        void record(String event) {
            if (events.size() == MAX_EVENTS) events.remove(0);
            events.add("wallMs=" + System.currentTimeMillis()
                    + ", elapsedRealtimeMs=" + android.os.SystemClock.elapsedRealtime()
                    + " " + clip(event, 180));
        }

        String describeFailure(android.app.NotificationManager manager, int expectedId,
                String expectedTitle, String lifecycleAction,
                android.app.Notification observed) {
            StringBuilder output = new StringBuilder("FOCUS_NOTIFICATION_FAILURE_DIAGNOSTICS\n")
                    .append("action=").append(clip(lifecycleAction, 120))
                    .append(" expectedId=").append(expectedId)
                    .append(" expectedTitle=").append(clip(expectedTitle, 96))
                    .append(" observed=").append(clip(describeNotification(observed), 320))
                    .append("\nnotification operation boundaries (coordinator source order):");
            for (String event : events) output.append("\n  ").append(event);

            try {
                android.app.NotificationChannel channel = manager.getNotificationChannel(
                        TaskFocusTimerNotification.CHANNEL_ID);
                output.append("\nchannel id=").append(TaskFocusTimerNotification.CHANNEL_ID);
                if (channel == null) {
                    output.append(" importance=missing");
                } else {
                    int importance = channel.getImportance();
                    output.append(" importance=").append(importance)
                            .append(" (").append(importanceName(importance)).append(')');
                }
            } catch (RuntimeException failure) {
                output.append("\nchannel diagnostics failed: ")
                        .append(clip(failure.toString(), 180));
            }

            try {
                android.service.notification.StatusBarNotification[] active = manager.getActiveNotifications();
                output.append("\nactive notification count=").append(active.length);
                int count = Math.min(active.length, MAX_ACTIVE_NOTIFICATIONS);
                for (int index = 0; index < count; index++) {
                    android.service.notification.StatusBarNotification posted = active[index];
                    android.app.Notification notification = posted.getNotification();
                    CharSequence title = notification == null || notification.extras == null ? null
                            : notification.extras.getCharSequence(android.app.Notification.EXTRA_TITLE);
                    output.append("\n  id=").append(posted.getId())
                            .append(" tag=").append(clip(posted.getTag(), 80))
                            .append(" postTime=").append(posted.getPostTime())
                            .append(" title=").append(clip(title == null ? null : title.toString(), 96));
                }
                if (active.length > count) output.append("\n  omitted=").append(active.length - count);
            } catch (RuntimeException failure) {
                output.append("\nactive notification diagnostics failed: ")
                        .append(clip(failure.toString(), 180));
            }

            if (output.length() > MAX_OUTPUT_CHARS) {
                return output.substring(0, MAX_OUTPUT_CHARS) + "\n[diagnostics truncated]";
            }
            return output.toString();
        }

        private static String importanceName(int importance) {
            switch (importance) {
                case android.app.NotificationManager.IMPORTANCE_NONE: return "NONE";
                case android.app.NotificationManager.IMPORTANCE_MIN: return "MIN";
                case android.app.NotificationManager.IMPORTANCE_LOW: return "LOW";
                case android.app.NotificationManager.IMPORTANCE_DEFAULT: return "DEFAULT";
                case android.app.NotificationManager.IMPORTANCE_HIGH: return "HIGH";
                case android.app.NotificationManager.IMPORTANCE_MAX: return "MAX";
                default: return "OTHER";
            }
        }

        private static String clip(String value, int maxChars) {
            if (value == null) return "<null>";
            String normalized = value.replace('\n', ' ').replace('\r', ' ');
            return normalized.length() <= maxChars ? normalized
                    : normalized.substring(0, maxChars) + "…";
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

    private static android.app.Notification awaitPausedNotification(
            android.app.NotificationManager manager, int id, String expectedTitle)
            throws InterruptedException {
        for (int attempt = 0; attempt < 20; attempt++) {
            android.app.Notification notification = activeNotification(manager, id);
            if (isExpectedPausedNotification(notification, expectedTitle)) return notification;
            Thread.sleep(100L);
        }
        return activeNotification(manager, id);
    }

    private static boolean isExpectedPausedNotification(android.app.Notification notification,
            String expectedTitle) {
        if (notification == null || notification.extras == null
                || !expectedTitle.equals(notification.extras.getString(
                        android.app.Notification.EXTRA_TITLE))) return false;
        String text = notification.extras.getString(android.app.Notification.EXTRA_TEXT);
        if (text == null || !text.startsWith("Paused · ")
                || (notification.flags & android.app.Notification.FLAG_ONGOING_EVENT) == 0
                || notification.extras.getBoolean(android.app.Notification.EXTRA_SHOW_CHRONOMETER, false)
                || notification.extras.getInt(android.app.Notification.EXTRA_PROGRESS_MAX, 0) <= 0
                || notification.extras.getBoolean(
                        android.app.Notification.EXTRA_PROGRESS_INDETERMINATE, true)
                || notification.actions == null || notification.actions.length != 2) return false;
        return "Resume".contentEquals(notification.actions[0].title)
                && "Finish".contentEquals(notification.actions[1].title);
    }

    private static String describeNotification(android.app.Notification notification) {
        if (notification == null) return "missing";
        android.os.Bundle extras = notification.extras;
        if (extras == null) return "extras=missing flags=0x"
                + Integer.toHexString(notification.flags);
        StringBuilder actions = new StringBuilder("[");
        if (notification.actions != null) {
            for (int i = 0; i < notification.actions.length; i++) {
                if (i > 0) actions.append(", ");
                CharSequence title = notification.actions[i] == null
                        ? null : notification.actions[i].title;
                actions.append(title == null ? "<null>" : title);
            }
        }
        actions.append(']');
        return "title=" + extras.getString(android.app.Notification.EXTRA_TITLE)
                + ", text=" + extras.getString(android.app.Notification.EXTRA_TEXT)
                + ", flags=0x" + Integer.toHexString(notification.flags)
                + ", chronometer=" + extras.getBoolean(
                        android.app.Notification.EXTRA_SHOW_CHRONOMETER, false)
                + ", progressMax=" + extras.getInt(
                        android.app.Notification.EXTRA_PROGRESS_MAX, 0)
                + ", progress=" + extras.getInt(
                        android.app.Notification.EXTRA_PROGRESS, 0)
                + ", indeterminate=" + extras.getBoolean(
                        android.app.Notification.EXTRA_PROGRESS_INDETERMINATE, true)
                + ", actions=" + actions;
    }

    private void checkPausedNotification(android.app.NotificationManager manager,
            int id, String expectedTitle, String lifecycleAction,
            FocusNotificationDiagnostics diagnostics) throws InterruptedException {
        android.app.Notification notification = awaitPausedNotification(manager, id, expectedTitle);
        boolean expected = isExpectedPausedNotification(notification, expectedTitle);
        String failureDiagnostics = "";
        if (!expected) {
            failureDiagnostics = diagnostics.describeFailure(
                    manager, id, expectedTitle, lifecycleAction, notification);
            android.util.Log.e(LOG_TAG, failureDiagnostics);
            System.out.println(failureDiagnostics);
        }
        check(expected,
                lifecycleAction + " eventually publishes the expected paused notification state; observed="
                        + describeNotification(notification)
                        + (expected ? "" : "\n" + failureDiagnostics));
        check(notification != null && notification.extras != null
                        && expectedTitle.equals(notification.extras.getString(
                                android.app.Notification.EXTRA_TITLE)),
                lifecycleAction + " displays the current task title");
        check(notification != null && notification.extras != null
                        && notification.extras.getString(android.app.Notification.EXTRA_TEXT) != null
                        && notification.extras.getString(android.app.Notification.EXTRA_TEXT)
                                .startsWith("Paused · "),
                lifecycleAction + " displays frozen paused-time text");
        check(notification != null && notification.extras != null
                        && (notification.flags & android.app.Notification.FLAG_ONGOING_EVENT) != 0
                        && !notification.extras.getBoolean(
                                android.app.Notification.EXTRA_SHOW_CHRONOMETER, false)
                        && notification.extras.getInt(android.app.Notification.EXTRA_PROGRESS_MAX, 0) > 0
                        && !notification.extras.getBoolean(
                                android.app.Notification.EXTRA_PROGRESS_INDETERMINATE, true),
                lifecycleAction + " keeps determinate progress without a live chronometer");
        check(notification != null && notification.actions != null
                        && notification.actions.length == 2
                        && "Resume".contentEquals(notification.actions[0].title)
                        && "Finish".contentEquals(notification.actions[1].title),
                lifecycleAction + " exposes Resume and Finish actions");
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

            byte[] recoveryKey = PortableBackupCodec.newRecoveryKey(new SecureRandom());
            try {
                ByteArrayOutputStream archive = new ByteArrayOutputStream();
                PortableBackupCodec.writeArchive(archive, recoveryKey, tasks,
                        (task, attachment) -> { throw new IOException("Unexpected attachment"); },
                        new SecureRandom(), () -> false);
                File targetRoot = new File(root, "backup-target");
                check(targetRoot.mkdirs(), "clip backup target is isolated");
                IsolatedContext targetContext = new IsolatedContext(getTargetContext(), targetRoot);
                File targetFile = new File(targetContext.getFilesDir(), "tasks.enc");
                EncryptedTaskStore targetStore = new EncryptedTaskStore(targetFile, new FixedTestKey());
                check(targetStore.load().isEmpty(), "clip backup target starts empty");
                Task targetExisting = TaskLogic.create("Existing target task", null, "medium");
                TaskTemplate targetTemplate = TaskTemplateLogic.create("Existing target template", null, "low");
                targetStore.saveSnapshot(Collections.singletonList(targetExisting),
                        Collections.singletonList(targetTemplate));
                new PortableBackupManager(targetContext).restore(new ByteArrayInputStream(archive.toByteArray()),
                        recoveryKey.clone(), targetStore, new AndroidAttachmentStore(targetContext), () -> false);

                EncryptedTaskStore targetReopened = new EncryptedTaskStore(targetFile, new FixedTestKey());
                List<Task> restored = targetReopened.load();
                check(restored.size() == 3 && restored.get(0).id.equals(targetExisting.id),
                        "restoring the clip backup preserves the target's existing task");
                check(targetReopened.loadTemplates().size() == 1
                                && targetReopened.loadTemplates().get(0).id.equals(targetTemplate.id),
                        "restoring the clip backup preserves the target's existing template");
                Task restoredClip = restored.get(2);
                check(!restoredClip.id.equals(clip.id) && restoredClip.title.equals(clip.title)
                                && restoredClip.notes.equals(clip.notes) && restoredClip.tags.contains(WebClip.TAG),
                        "clip source, multiline excerpt and tag survive encrypted export and restore");
            } finally {
                PortableBackupCodec.clear(recoveryKey);
            }
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
