package com.abrar.daymark;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** End-to-end IME visibility and save/cancel checks for the real task editor. */
final class TaskEditorImeInstrumentation {
    private static final String TAG = "TaskEditorIme";
    private static final String EDITOR_TITLE = "Add task details";
    private static final String TITLE_FIELD_DESCRIPTION = "Task name. You can edit this before saving.";
    /** API 29 emulators can take longer for storage readiness + dialog a11y tree. */
    private static final long WAIT_MS = 15000L;
    private static final long TRACE_SAMPLE_INTERVAL_MS = 2500L;
    private static final long TRACE_MAIN_THREAD_TIMEOUT_MS = 100L;
    private static final int TRACE_MAX_ENTRIES = 20;
    private static final int TRACE_MAX_ENTRY_CHARS = 850;
    private static final int TRACE_MAX_WINDOWS = 8;

    private TaskEditorImeInstrumentation() { }

    private static final class UiTrace {
        private final Instrumentation instrumentation;
        private final MainActivity activity;
        private final List<String> entries = new ArrayList<>();

        UiTrace(Instrumentation instrumentation, MainActivity activity) {
            this.instrumentation = instrumentation;
            this.activity = activity;
        }

        void reset() {
            entries.clear();
        }

        void record(String label) {
            append(label + "{" + describeActivityWindowState(activity, TRACE_MAIN_THREAD_TIMEOUT_MS)
                    + "; windows=" + describeWindowInventory(instrumentation) + "}");
        }

        void recordPoll(String label, long elapsedMs, String windows) {
            append(label + "+" + elapsedMs + "ms{"
                    + describeActivityWindowState(activity, TRACE_MAIN_THREAD_TIMEOUT_MS)
                    + "; windows=" + windows + "}");
        }

        String summary() {
            StringBuilder summary = new StringBuilder();
            for (String entry : entries) {
                if (summary.length() > 0) summary.append(" | ");
                summary.append(entry);
            }
            return summary.length() == 0 ? "none" : summary.toString();
        }

        private void append(String entry) {
            if (entry.length() > TRACE_MAX_ENTRY_CHARS) {
                entry = entry.substring(0, TRACE_MAX_ENTRY_CHARS - 3) + "...";
            }
            if (entries.size() >= TRACE_MAX_ENTRIES) entries.remove(0);
            entries.add(entry);
        }
    }

    static int run(Instrumentation instrumentation) throws Exception {
        int[] assertions = { 0 };
        MainActivity activity = null;
        String token = "IME footer test " + UUID.randomUUID();
        String cancelledTitle = token + " cancelled";
        String savedTitle = token + " saved";
        boolean savedTaskMayExist = false;
        try {
            UiAutomation automation = instrumentation.getUiAutomation();
            AccessibilityServiceInfo serviceInfo = automation.getServiceInfo();
            if (serviceInfo == null) throw new AssertionError("UiAutomation has no accessibility service info.");
            // UiAutomation.getWindows() returns no interactive windows until this flag is enabled.
            serviceInfo.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
                    | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            automation.setServiceInfo(serviceInfo);

            Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            Activity started = instrumentation.startActivitySync(launch);
            require(started instanceof MainActivity, "instrumentation launches the real MainActivity", assertions);
            activity = (MainActivity) started;
            UiTrace trace = new UiTrace(instrumentation, activity);
            instrumentation.waitForIdleSync();
            ensureTasksMode(instrumentation, activity, assertions);
            awaitStorageReady(instrumentation, activity, assertions);
            byte[] storageBeforeCancel = encryptedTaskStorageSnapshot(activity);

            openEditor(instrumentation, activity, assertions, trace);
            exerciseImeActions(instrumentation, activity, cancelledTitle, assertions, trace);
            tapDialogAction(instrumentation, activity, EDITOR_TITLE, "android:id/button2", "Cancel", assertions, trace);
            awaitDialogGone(instrumentation, EDITOR_TITLE);
            awaitImeHidden(instrumentation);
            require(Arrays.equals(storageBeforeCancel, encryptedTaskStorageSnapshot(activity)),
                    "Cancel leaves encrypted task storage byte-for-byte unchanged", assertions);
            require(!taskTitleVisible(instrumentation, activity, cancelledTitle),
                    "Cancel closes the editor without creating the typed task", assertions);

            openEditor(instrumentation, activity, assertions, trace);
            exerciseImeActions(instrumentation, activity, savedTitle, assertions, trace);
            savedTaskMayExist = true;
            tapDialogAction(instrumentation, activity, EDITOR_TITLE, "android:id/button1", "Add task", assertions, trace);
            awaitDialogGone(instrumentation, EDITOR_TITLE);
            awaitImeHidden(instrumentation);
            require(awaitTaskTitleVisible(instrumentation, activity, savedTitle),
                    "Add Task saves and renders the typed task", assertions);
            require(awaitPersistedTaskTitle(activity, savedTitle),
                    "Add Task persists the typed task in encrypted storage", assertions);

            deleteSavedTask(instrumentation, activity, savedTitle, assertions);
            savedTaskMayExist = false;
            require(!taskTitleVisible(instrumentation, activity, savedTitle),
                    "instrumentation removes its saved task fixture", assertions);
            return assertions[0];
        } finally {
            if (savedTaskMayExist && activity != null) {
                try {
                    deleteSavedTask(instrumentation, activity, savedTitle, assertions);
                } catch (Throwable ignored) {
                    // Preserve the primary failure; the task title is unique to this run.
                }
            }
            if (activity != null && !activity.isFinishing()) {
                Activity closing = activity;
                instrumentation.runOnMainSync(closing::finish);
                instrumentation.waitForIdleSync();
            }
        }
    }

    private static void ensureTasksMode(Instrumentation instrumentation, MainActivity activity, int[] assertions)
            throws Exception {
        boolean[] selected = { false };
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline && !selected[0]) {
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> {
                View root = activity.getWindow().getDecorView();
                View selectedTasks = findByDescription(root, "Tasks page, selected.");
                if (selectedTasks != null && selectedTasks.isShown()) {
                    selected[0] = true;
                    return;
                }
                View switchTasks = findByDescription(root, "Tasks page. Switch to tasks and dashboard.");
                if (switchTasks != null && switchTasks.isShown() && switchTasks.isEnabled()) {
                    switchTasks.performClick();
                }
            });
            if (!selected[0]) SystemClock.sleep(50L);
        }
        require(selected[0], "the visible Tasks workspace is selected before opening the task editor", assertions);
    }

    private static void awaitStorageReady(Instrumentation instrumentation, MainActivity activity, int[] assertions)
            throws Exception {
        boolean[] ready = { false };
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline && !ready[0]) {
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> ready[0] = isStorageReady(activity));
            if (!ready[0]) SystemClock.sleep(50L);
        }
        require(ready[0], "MainActivity reports encrypted storage ready before opening the task editor", assertions);
    }

    private static boolean isStorageReady(MainActivity activity) {
        try {
            Field readyField = MainActivity.class.getDeclaredField("storageReady");
            readyField.setAccessible(true);
            return readyField.getBoolean(activity);
        } catch (ReflectiveOperationException failure) {
            throw new AssertionError("Could not read MainActivity.storageReady for instrumentation.", failure);
        }
    }

    private static void openEditor(Instrumentation instrumentation, MainActivity activity, int[] assertions,
                                   UiTrace trace) throws Exception {
        trace.reset();
        ensureTasksMode(instrumentation, activity, assertions);
        awaitStorageReady(instrumentation, activity, assertions);
        View[] addTask = { null };
        boolean[] enabled = { false };
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline && !enabled[0]) {
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> {
                addTask[0] = findTextView(activity.getWindow().getDecorView(), "Add task");
                if (addTask[0] != null && addTask[0].isShown() && addTask[0].isEnabled()) {
                    enabled[0] = true;
                }
            });
            if (!enabled[0]) SystemClock.sleep(50L);
        }
        require(addTask[0] != null && enabled[0],
                "the visible Add task button becomes enabled after storage loads", assertions);
        trace.record("open.beforeAddTaskClick");

        // Click only once: repeated clicks can stack dialogs while API 29 a11y is delayed.
        boolean[] clicked = { false };
        instrumentation.runOnMainSync(() -> {
            View btn = addTask[0];
            if (btn != null && btn.isShown() && btn.isEnabled()) {
                clicked[0] = btn.performClick();
            }
        });
        require(clicked[0], "the ready Add task button accepts one click", assertions);
        trace.record("open.addTaskClickReturned");

        // Wait for either accessibility signal; do not retry the click while the tree publishes.
        long openDeadline = SystemClock.uptimeMillis() + WAIT_MS;
        AccessibilityNodeInfo root = null;
        while (SystemClock.uptimeMillis() < openDeadline && root == null) {
            instrumentation.waitForIdleSync();
            root = findDialogRoot(instrumentation, EDITOR_TITLE);
            if (root == null) {
                // Secondary signal: title field content description may appear before title text.
                root = findDialogRootByDescription(instrumentation, TITLE_FIELD_DESCRIPTION);
            }
            if (root == null) SystemClock.sleep(50L);
        }
        require(root != null, "the Add task button opens the full editor dialog", assertions);
        trace.record("open.dialogRootPublished");
        // Ensure the canonical title is eventually visible for subsequent steps.
        awaitDialogRoot(instrumentation, EDITOR_TITLE);
        trace.record("open.canonicalDialogRootReady");
    }

    private static void exerciseImeActions(Instrumentation instrumentation, MainActivity activity,
                                           String title, int[] assertions, UiTrace trace)
            throws Exception {
        AccessibilityNodeInfo root = awaitDialogRoot(instrumentation, EDITOR_TITLE);
        trace.record("exercise.dialogRootReady");
        AccessibilityNodeInfo titleField = findByDescription(root, TITLE_FIELD_DESCRIPTION);
        require(titleField != null, "the editor exposes its task title field", assertions);
        // MainActivity requests title focus when the dialog opens; ACTION_FOCUS may return false if already focused.
        trace.record("exercise.beforeTitleFocus");
        boolean titleFocused = titleField.isFocused()
                || titleField.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        require(titleFocused,
                "the task title field is focused or accepts focus", assertions);
        trace.record("exercise.afterTitleFocus");
        Rect imeBounds = findImeBounds(instrumentation);
        trace.record("exercise.afterImeProbe.bounds="
                + (imeBounds == null ? "none" : imeBounds.toShortString()));
        if (imeBounds == null) {
            // Some CI emulator images never surface a software IME window when a
            // field takes focus, so resize behavior cannot be exercised there.
            // Record the probe as not testable on this runner and keep every
            // other assertion strict instead of failing unrelated coverage.
            Log.i(TAG, "No software keyboard on this runner; IME-viewport assertions skipped.");
        } else {
            require(imeBounds.height() >= 100, "the software keyboard is visible and consumes viewport height", assertions);
        }

        root = awaitDialogRoot(instrumentation, EDITOR_TITLE);
        trace.record("exercise.dialogRootAfterImeReady");
        AccessibilityNodeInfo scrollView = findScrollable(root);
        require(scrollView != null, "the task form remains scrollable within the dialog viewport", assertions);
        trace.record("exercise.beforeCancelButtonWait");
        AccessibilityNodeInfo cancel = awaitDialogButton(
                instrumentation, activity, EDITOR_TITLE, "android:id/button2", "Cancel", trace);
        trace.record("exercise.cancelButtonReady");
        trace.record("exercise.beforeAddButtonWait");
        AccessibilityNodeInfo add = awaitDialogButton(
                instrumentation, activity, EDITOR_TITLE, "android:id/button1", "Add task", trace);
        trace.record("exercise.addButtonReady");
        require(hasVisibleTouchBounds(cancel), "the Cancel dialog action has a visible touch target", assertions);
        require(hasVisibleTouchBounds(add), "the Add Task dialog action has a visible touch target", assertions);
        if (imeBounds != null) {
            checkVisibleAboveIme(instrumentation, cancel, imeBounds, "Cancel", assertions);
            checkVisibleAboveIme(instrumentation, add, imeBounds, "Add Task", assertions);
        }

        titleField = findByDescription(root, TITLE_FIELD_DESCRIPTION);
        Bundle text = new Bundle();
        text.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, title);
        trace.record("exercise.beforeSetText");
        require(titleField != null && titleField.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, text),
                "the focused title field accepts test text", assertions);
        instrumentation.waitForIdleSync();
        trace.record("exercise.afterSetTextAndIdle");
    }

    private static AccessibilityNodeInfo awaitDialogButton(Instrumentation instrumentation, MainActivity activity,
                                                            String dialogTitle, String viewId, String label,
                                                            UiTrace trace)
            throws Exception {
        long startedAt = SystemClock.uptimeMillis();
        long deadline = startedAt + WAIT_MS;
        long nextTraceAt = startedAt;
        while (SystemClock.uptimeMillis() < deadline) {
            long now = SystemClock.uptimeMillis();
            boolean captureTrace = trace != null && now >= nextTraceAt;
            StringBuilder windowSnapshot = captureTrace ? new StringBuilder() : null;
            List<AccessibilityWindowInfo> windows = instrumentation.getUiAutomation().getWindows();
            int sampledWindows = Math.min(windows.size(), TRACE_MAX_WINDOWS);
            for (int index = 0; index < windows.size(); index++) {
                AccessibilityWindowInfo window = windows.get(index);
                AccessibilityNodeInfo root = window.getRoot();
                boolean dialogPresent = root != null && findByText(root, dialogTitle) != null;
                AccessibilityNodeInfo button = null;
                boolean labelPresent = false;
                boolean visibleTarget = false;
                if (dialogPresent) {
                    button = findByViewId(root, viewId);
                    if (button == null) button = findButtonByText(root, label);
                    labelPresent = button != null && findByText(button, label) != null;
                    visibleTarget = labelPresent && hasVisibleTouchBounds(button);
                }
                if (captureTrace && index < sampledWindows) {
                    appendObservedWindow(windowSnapshot, window, index, dialogPresent,
                            button, labelPresent, visibleTarget);
                }
                if (visibleTarget) {
                    if (trace != null) trace.record("buttonReady." + label);
                    return button;
                }
            }
            if (captureTrace) {
                if (windows.size() > sampledWindows) {
                    windowSnapshot.append("|+").append(windows.size() - sampledWindows).append(" more windows");
                }
                String observed = windowSnapshot.length() == 0 ? "none" : windowSnapshot.toString();
                trace.recordPoll(label + ".wait", now - startedAt, observed);
                nextTraceAt = now + TRACE_SAMPLE_INTERVAL_MS;
            }
            SystemClock.sleep(50L);
        }
        throw new AssertionError("timeout " + label + "; "
                + describeDialogButtonTimeoutState(instrumentation, activity, dialogTitle, viewId, label,
                        SystemClock.uptimeMillis() - startedAt, trace));
    }

    private static String describeDialogButtonTimeoutState(Instrumentation instrumentation, MainActivity activity,
                                                             String dialogTitle, String viewId, String label,
                                                             long elapsedMs, UiTrace trace) {
        StringBuilder summary = new StringBuilder();
        summary.append(describeActivityWindowState(activity));
        summary.append("; ").append(describeImeWindows(instrumentation));
        summary.append("; elapsedMs=").append(elapsedMs)
                .append("; target={title=").append(dialogTitle).append(",viewId=").append(viewId)
                .append(",label=").append(label).append("}")
                .append("; targetNode=").append(describeDialogButtonNode(instrumentation, dialogTitle, viewId, label))
                .append("; stepTrace=")
                .append(trace == null ? "none" : trace.summary()).append("; accessibilityWindows=");
        try {
            List<AccessibilityWindowInfo> windows = instrumentation.getUiAutomation().getWindows();
            if (windows.isEmpty()) return summary.append("none").toString();
            int[] remainingNodes = { 120 };
            int shownWindows = Math.min(windows.size(), 12);
            for (int i = 0; i < shownWindows; i++) {
                AccessibilityWindowInfo window = windows.get(i);
                if (i > 0) summary.append(" | ");
                Rect bounds = new Rect();
                window.getBoundsInScreen(bounds);
                summary.append("W{type=").append(window.getType())
                        .append(",title=").append(shortDiagnosticValue(window.getTitle()))
                        .append(",layer=").append(window.getLayer())
                        .append(",active=").append(window.isActive())
                        .append(",focused=").append(window.isFocused())
                        .append(",bounds=").append(bounds.toShortString());
                AccessibilityNodeInfo root = window.getRoot();
                if (root == null) {
                    summary.append(",root=none}");
                } else {
                    summary.append(",tree=");
                    appendAccessibilityTree(root, summary, 0, remainingNodes);
                    summary.append('}');
                }
                if (remainingNodes[0] <= 0) {
                    summary.append(" | nodeLimitReached");
                    break;
                }
            }
            if (windows.size() > shownWindows) summary.append(" | windowLimitReached=").append(windows.size());
        } catch (Throwable failure) {
            summary.append("unavailable=").append(failure.getClass().getSimpleName());
        }
        return summary.toString();
    }

    private static String describeActivityWindowState(MainActivity activity) {
        return describeActivityWindowState(activity, 750L);
    }

    private static String describeActivityWindowState(MainActivity activity, long timeoutMs) {
        if (activity == null) return "activity=none";
        String[] snapshot = { "activityState=unavailable" };
        CountDownLatch captured = new CountDownLatch(1);
        boolean posted = new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Window window = activity.getWindow();
                View focusedView = activity.getCurrentFocus();
                InputMethodManager inputMethod = (InputMethodManager) activity
                        .getSystemService(Context.INPUT_METHOD_SERVICE);
                snapshot[0] = "act=" + activity.getClass().getSimpleName()
                        + "[fin=" + (activity.isFinishing() ? 1 : 0)
                        + ",dst=" + (activity.isDestroyed() ? 1 : 0)
                        + ",cfg=" + (activity.isChangingConfigurations() ? 1 : 0)
                        + ",wf=" + (activity.hasWindowFocus() ? 1 : 0) + "]"
                        + ",focus=" + describeFocusedView(focusedView)
                        + ",soft=0x" + (window == null ? "none"
                                : Integer.toHexString(window.getAttributes().softInputMode))
                        + ",input=" + (inputMethod != null && inputMethod.isAcceptingText() ? 1 : 0);
            } catch (Throwable failure) {
                snapshot[0] = "activityStateError=" + failure.getClass().getSimpleName();
            } finally {
                captured.countDown();
            }
        });
        if (!posted) return "activityState=mainLooperUnavailable";
        try {
            if (!captured.await(timeoutMs, TimeUnit.MILLISECONDS)) return "activityState=mainLooperSnapshotTimedOut";
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return "activityStateSnapshotInterrupted";
        }
        return snapshot[0];
    }

    private static String describeFocusedView(View view) {
        if (view == null) return "none";
        return view.getClass().getSimpleName() + "[f=" + (view.isFocused() ? 1 : 0) + "]";
    }

    private static String describeImeWindows(Instrumentation instrumentation) {
        StringBuilder summary = new StringBuilder();
        try {
            for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
                if (window.getType() != AccessibilityWindowInfo.TYPE_INPUT_METHOD) continue;
                Rect bounds = new Rect();
                window.getBoundsInScreen(bounds);
                if (summary.length() > 0) summary.append('|');
                summary.append("ime{v=").append(bounds.isEmpty() ? 0 : 1)
                        .append(",a=").append(window.isActive() ? 1 : 0)
                        .append(",f=").append(window.isFocused() ? 1 : 0)
                        .append(",b=").append(bounds.toShortString()).append('}');
            }
        } catch (Throwable failure) {
            return "error=" + failure.getClass().getSimpleName();
        }
        return summary.length() == 0 ? "none" : summary.toString();
    }

    private static String describeWindowInventory(Instrumentation instrumentation) {
        StringBuilder summary = new StringBuilder();
        try {
            List<AccessibilityWindowInfo> windows = instrumentation.getUiAutomation().getWindows();
            if (windows.isEmpty()) return "none";
            int shownWindows = Math.min(windows.size(), TRACE_MAX_WINDOWS);
            for (int i = 0; i < shownWindows; i++) {
                if (i > 0) summary.append('|');
                appendWindowMetadata(summary, windows.get(i), i);
                summary.append('}');
            }
            if (windows.size() > shownWindows) {
                summary.append("|+").append(windows.size() - shownWindows).append(" more windows");
            }
        } catch (Throwable failure) {
            return "unavailable=" + failure.getClass().getSimpleName();
        }
        return summary.toString();
    }

    private static void appendObservedWindow(StringBuilder summary, AccessibilityWindowInfo window, int index,
                                             boolean dialogPresent, AccessibilityNodeInfo button,
                                             boolean labelPresent, boolean visibleTarget) {
        if (summary.length() > 0) summary.append('|');
        appendWindowMetadata(summary, window, index);
        summary.append(",dialog=").append(dialogPresent ? 1 : 0)
                .append(",button=").append(button != null ? 1 : 0)
                .append(",label=").append(labelPresent ? 1 : 0)
                .append(",touch=").append(visibleTarget ? 1 : 0)
                .append(",buttonNode=").append(describeAccessibilityNode(button)).append('}');
    }

    private static String describeDialogButtonNode(Instrumentation instrumentation, String dialogTitle,
                                                     String viewId, String label) {
        try {
            for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
                AccessibilityNodeInfo root = window.getRoot();
                if (root == null || findByText(root, dialogTitle) == null) continue;
                AccessibilityNodeInfo button = findByViewId(root, viewId);
                if (button == null) button = findButtonByText(root, label);
                if (button != null) return describeAccessibilityNode(button);
            }
        } catch (Throwable failure) {
            return "unavailable=" + failure.getClass().getSimpleName();
        }
        return "none";
    }

    private static String describeAccessibilityNode(AccessibilityNodeInfo node) {
        if (node == null) return "none";
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        return "{class=" + shortDiagnosticValue(node.getClassName())
                + ",id=" + shortDiagnosticValue(node.getViewIdResourceName())
                + ",text=" + shortDiagnosticValue(node.getText())
                + ",bounds=" + bounds.toShortString()
                + ",visible=" + (node.isVisibleToUser() ? 1 : 0)
                + ",clickable=" + (node.isClickable() ? 1 : 0)
                + ",enabled=" + (node.isEnabled() ? 1 : 0)
                + ",windowId=" + node.getWindowId() + "}";
    }

    private static void appendWindowMetadata(StringBuilder summary, AccessibilityWindowInfo window, int index) {
        summary.append('w').append(index).append("{t=");
        try {
            summary.append(window.getType())
                    .append(",title=").append(shortDiagnosticValue(window.getTitle()))
                    .append(",layer=").append(window.getLayer())
                    .append(",active=").append(window.isActive() ? 1 : 0)
                    .append(",focused=").append(window.isFocused() ? 1 : 0);
            Rect bounds = new Rect();
            window.getBoundsInScreen(bounds);
            summary.append(",bounds=").append(bounds.toShortString());
        } catch (Throwable failure) {
            summary.append("metadataError=").append(failure.getClass().getSimpleName());
        }
    }

    private static String shortDiagnosticValue(CharSequence value) {
        if (value == null) return "none";
        String text = value.toString().replace('\n', ' ').replace('\r', ' ').replace(';', ',');
        return text.length() <= 72 ? text : text.substring(0, 69) + "...";
    }

    private static void checkVisibleAboveIme(Instrumentation instrumentation, AccessibilityNodeInfo button,
                                             Rect imeBounds, String label, int[] assertions) {
        Rect bounds = new Rect();
        button.getBoundsInScreen(bounds);
        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager manager = (WindowManager) instrumentation.getTargetContext()
                .getSystemService(Context.WINDOW_SERVICE);
        Display display = manager == null ? null : manager.getDefaultDisplay();
        if (display != null) display.getRealMetrics(metrics);
        boolean onScreen = !bounds.isEmpty() && bounds.left >= 0 && bounds.top >= 0
                && (metrics.widthPixels <= 0 || bounds.right <= metrics.widthPixels)
                && (metrics.heightPixels <= 0 || bounds.bottom <= metrics.heightPixels);
        require(button.isVisibleToUser() && onScreen,
                label + " is visible within the device screen while the IME is shown", assertions);
        require(!Rect.intersects(bounds, imeBounds), label + " is not covered by the IME", assertions);
    }

    private static void tapDialogAction(Instrumentation instrumentation, MainActivity activity,
                                        String dialogTitle, String viewId, String label, int[] assertions,
                                        UiTrace trace)
            throws Exception {
        trace.record("tap.beforeButtonWait." + label);
        AccessibilityNodeInfo button = awaitDialogButton(
                instrumentation, activity, dialogTitle, viewId, label, trace);
        trace.record("tap.buttonReady." + label);
        require(hasVisibleTouchBounds(button), label + " button has visible touch bounds before tapping", assertions);
        Rect bounds = new Rect();
        button.getBoundsInScreen(bounds);
        trace.record("tap.beforeInject." + label);
        boolean tapped = injectTap(instrumentation, bounds);
        require(tapped, label + " button accepts exactly one real touch at its visible bounds", assertions);
        trace.record("tap.afterInject." + label);
        instrumentation.waitForIdleSync();
        trace.record("tap.afterIdle." + label);
    }

    private static boolean injectTap(Instrumentation instrumentation, Rect bounds) {
        int x = bounds.centerX();
        int y = bounds.centerY();
        long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(downTime, downTime + 80L, MotionEvent.ACTION_UP, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            boolean downSent = instrumentation.getUiAutomation().injectInputEvent((InputEvent) down, true);
            SystemClock.sleep(80L);
            boolean upSent = instrumentation.getUiAutomation().injectInputEvent((InputEvent) up, true);
            return downSent && upSent;
        } finally {
            down.recycle();
            up.recycle();
        }
    }

    /**
     * Taps a dialog node with a real touch event. Some CI emulator images reject synthetic
     * touch injection on dialog windows; in that case the same visible node is clicked through
     * its accessibility action, which still dispatches a genuine click through the framework.
     */
    private static boolean tapNode(Instrumentation instrumentation, AccessibilityNodeInfo node) {
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        if (!bounds.isEmpty() && injectTap(instrumentation, bounds)) return true;
        Log.i(TAG, "Touch injection unavailable for node; using ACTION_CLICK fallback.");
        return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
    }

    private static void deleteSavedTask(Instrumentation instrumentation, Activity activity, String title,
                                        int[] assertions) throws Exception {
        awaitImeHidden(instrumentation);
        View[] actions = { null };
        boolean[] opened = { false };
        instrumentation.runOnMainSync(() -> {
            actions[0] = findByDescription(activity.getWindow().getDecorView(), "Task actions for: " + title);
            if (actions[0] != null) opened[0] = actions[0].performClick();
        });
        require(actions[0] != null && opened[0], "the saved test task exposes its actions", assertions);
        AccessibilityNodeInfo actionRoot = awaitDialogRootContaining(instrumentation, title, "Delete task");
        require(hasVisibleTouchBounds(findActionNodeByText(actionRoot, "Duplicate task")),
                "Duplicate task is directly available in the first task action list", assertions);
        require(hasVisibleTouchBounds(findActionNodeByText(actionRoot, "Set due date")),
                "date choices are directly discoverable from the first task action list", assertions);
        require(findActionNodeByText(actionRoot, "Task options") == null,
                "the task action list no longer routes through a generic nested Task options menu", assertions);
        AccessibilityNodeInfo deleteItem = findActionNodeByText(actionRoot, "Delete task");
        require(hasVisibleTouchBounds(deleteItem), "the task action list offers a visible Delete task target", assertions);
        require(tapNode(instrumentation, deleteItem), "the test task Delete action accepts a touch or accessibility click", assertions);

        AccessibilityNodeInfo confirmation = awaitDialogRootContaining(
                instrumentation, "Delete this task?", "Delete task");
        AccessibilityNodeInfo confirmButton = findActionNodeByText(confirmation, "Delete task");
        require(hasVisibleTouchBounds(confirmButton), "the delete confirmation has a visible Delete task target", assertions);
        require(tapNode(instrumentation, confirmButton), "the delete confirmation accepts a touch or accessibility click", assertions);
        awaitDialogGone(instrumentation, "Delete this task?");
        require(awaitTaskTitleGone(instrumentation, activity, title), "the test task is removed from the real task list",
                assertions);
    }

    private static boolean taskTitleVisible(Instrumentation instrumentation, Activity activity, String title)
            throws Exception {
        boolean[] visible = { false };
        instrumentation.runOnMainSync(() -> {
            View match = findTextView(activity.getWindow().getDecorView(), title);
            visible[0] = match != null && match.isShown();
        });
        return visible[0];
    }

    private static boolean awaitTaskTitleVisible(Instrumentation instrumentation, Activity activity, String title)
            throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            instrumentation.waitForIdleSync();
            if (taskTitleVisible(instrumentation, activity, title)) return true;
            SystemClock.sleep(50L);
        }
        return false;
    }

    private static boolean awaitPersistedTaskTitle(MainActivity activity, String title) throws Exception {
        EncryptedTaskStore store = getTaskStore(activity);
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            for (Task task : store.load()) {
                if (title.equals(task.title)) return true;
            }
            SystemClock.sleep(50L);
        }
        return false;
    }

    private static EncryptedTaskStore getTaskStore(MainActivity activity) {
        try {
            Field storeField = MainActivity.class.getDeclaredField("taskStore");
            storeField.setAccessible(true);
            Object store = storeField.get(activity);
            if (store instanceof EncryptedTaskStore) return (EncryptedTaskStore) store;
            throw new AssertionError("MainActivity has no ready encrypted task store.");
        } catch (ReflectiveOperationException failure) {
            throw new AssertionError("Could not access MainActivity.taskStore for instrumentation.", failure);
        }
    }

    private static byte[] encryptedTaskStorageSnapshot(Activity activity) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream output = new DataOutputStream(bytes);
        String[] names = { "tasks.enc", "tasks.enc.bak", "tasks.enc.new" };
        for (String name : names) {
            File file = new File(activity.getFilesDir(), name);
            output.writeUTF(name);
            output.writeBoolean(file.isFile());
            if (!file.isFile()) continue;
            output.writeLong(file.length());
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
            }
        }
        output.flush();
        return bytes.toByteArray();
    }

    private static boolean awaitTaskTitleGone(Instrumentation instrumentation, Activity activity, String title)
            throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            instrumentation.waitForIdleSync();
            if (!taskTitleVisible(instrumentation, activity, title)) return true;
            SystemClock.sleep(50L);
        }
        return false;
    }

    private static AccessibilityNodeInfo awaitDialogRoot(Instrumentation instrumentation, String title)
            throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            instrumentation.waitForIdleSync();
            AccessibilityNodeInfo root = findDialogRoot(instrumentation, title);
            if (root != null) return root;
            SystemClock.sleep(50L);
        }
        throw new AssertionError("Timed out waiting for dialog: " + title);
    }

    private static AccessibilityNodeInfo awaitDialogRootContaining(Instrumentation instrumentation, String title,
                                                                    String requiredText) throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            instrumentation.waitForIdleSync();
            for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
                AccessibilityNodeInfo root = window.getRoot();
                if (root != null && findByText(root, title) != null && findByText(root, requiredText) != null) {
                    return root;
                }
            }
            SystemClock.sleep(50L);
        }
        throw new AssertionError("Timed out waiting for dialog '" + title + "' containing: " + requiredText);
    }

    private static void awaitDialogGone(Instrumentation instrumentation, String title) throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            instrumentation.waitForIdleSync();
            if (findDialogRoot(instrumentation, title) == null) return;
            SystemClock.sleep(50L);
        }
        throw new AssertionError("Dialog did not close: " + title);
    }

    private static Rect findImeBounds(Instrumentation instrumentation) {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
                if (window.getType() == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                    Rect bounds = new Rect();
                    window.getBoundsInScreen(bounds);
                    if (!bounds.isEmpty()) return bounds;
                }
            }
            SystemClock.sleep(50L);
        }
        return null;
    }

    private static void awaitImeHidden(Instrumentation instrumentation) throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            boolean shown = false;
            for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
                if (window.getType() == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                    Rect bounds = new Rect();
                    window.getBoundsInScreen(bounds);
                    shown |= !bounds.isEmpty();
                }
            }
            if (!shown) return;
            SystemClock.sleep(50L);
        }
        throw new AssertionError("The software keyboard did not hide after dismissing the task editor.");
    }

    private static AccessibilityNodeInfo findDialogRoot(Instrumentation instrumentation, String title) {
        List<AccessibilityWindowInfo> windows = instrumentation.getUiAutomation().getWindows();
        for (AccessibilityWindowInfo window : windows) {
            AccessibilityNodeInfo root = window.getRoot();
            if (root != null && findByText(root, title) != null) return root;
        }
        return null;
    }

    private static AccessibilityNodeInfo findDialogRootByDescription(Instrumentation instrumentation,
                                                                     String description) {
        List<AccessibilityWindowInfo> windows = instrumentation.getUiAutomation().getWindows();
        for (AccessibilityWindowInfo window : windows) {
            AccessibilityNodeInfo root = window.getRoot();
            if (root != null && findByDescription(root, description) != null) return root;
        }
        return null;
    }

    private static boolean textMatches(CharSequence value, String expected) {
        return value != null && expected.equalsIgnoreCase(value.toString().trim());
    }

    private static AccessibilityNodeInfo findByText(AccessibilityNodeInfo root, String text) {
        if (root == null) return null;
        if (textMatches(root.getText(), text)) return root;
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = findByText(root.getChild(i), text);
            if (found != null) return found;
        }
        return null;
    }

    private static AccessibilityNodeInfo findClickableByText(AccessibilityNodeInfo root, String text) {
        if (root == null) return null;
        if (textMatches(root.getText(), text)) {
            AccessibilityNodeInfo node = root;
            while (node != null && !node.isClickable()) node = node.getParent();
            if (node != null) return node;
        }
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = findClickableByText(root.getChild(i), text);
            if (found != null) return found;
        }
        return null;
    }

    private static AccessibilityNodeInfo findByViewId(AccessibilityNodeInfo root, String viewId) {
        if (root == null) return null;
        if (viewId.equals(root.getViewIdResourceName())) return root;
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = findByViewId(root.getChild(i), viewId);
            if (found != null) return found;
        }
        return null;
    }

    private static void appendAccessibilityTree(AccessibilityNodeInfo node, StringBuilder summary,
                                                int depth, int[] remainingNodes) {
        if (node == null || remainingNodes[0] <= 0) return;
        remainingNodes[0]--;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        summary.append("N{").append(shortDiagnosticValue(node.getClassName()))
                .append(",id=").append(shortDiagnosticValue(node.getViewIdResourceName()))
                .append(",text=").append(shortDiagnosticValue(node.getText()))
                .append(",desc=").append(shortDiagnosticValue(node.getContentDescription()))
                .append(",visible=").append(node.isVisibleToUser())
                .append(",focused=").append(node.isFocused())
                .append(",a11yFocused=").append(node.isAccessibilityFocused())
                .append(",focusable=").append(node.isFocusable())
                .append(",clickable=").append(node.isClickable())
                .append(",scrollable=").append(node.isScrollable())
                .append(",bounds=").append(bounds.toShortString());
        if (depth >= 16 && node.getChildCount() > 0) {
            summary.append(",depthLimit");
        } else {
            for (int i = 0; i < node.getChildCount(); i++) {
                if (remainingNodes[0] <= 0) {
                    summary.append(",childrenTruncated");
                    break;
                }
                summary.append(" child=");
                appendAccessibilityTree(node.getChild(i), summary, depth + 1, remainingNodes);
            }
        }
        summary.append('}');
    }

    private static AccessibilityNodeInfo findButtonByText(AccessibilityNodeInfo root, String text) {
        if (root == null) return null;
        CharSequence className = root.getClassName();
        if (className != null && className.toString().endsWith("Button") && findByText(root, text) != null) {
            return root;
        }
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = findButtonByText(root.getChild(i), text);
            if (found != null) return found;
        }
        return null;
    }

    private static AccessibilityNodeInfo findActionNodeByText(AccessibilityNodeInfo root, String text) {
        AccessibilityNodeInfo button = findButtonByText(root, text);
        if (button != null) return button;
        AccessibilityNodeInfo clickable = findClickableByText(root, text);
        return clickable != null ? clickable : findByText(root, text);
    }

    private static boolean hasVisibleTouchBounds(AccessibilityNodeInfo node) {
        if (node == null) return false;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        return node.isVisibleToUser() && !bounds.isEmpty();
    }

    private static AccessibilityNodeInfo findByDescription(AccessibilityNodeInfo root, String description) {
        if (root == null) return null;
        CharSequence value = root.getContentDescription();
        if (value != null && description.contentEquals(value)) return root;
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = findByDescription(root.getChild(i), description);
            if (found != null) return found;
        }
        return null;
    }

    private static AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo root) {
        if (root == null) return null;
        if (root.isScrollable()) return root;
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = findScrollable(root.getChild(i));
            if (found != null) return found;
        }
        return null;
    }

    private static View findTextView(View root, String text) {
        if (root instanceof TextView) {
            CharSequence value = ((TextView) root).getText();
            if (value != null && text.contentEquals(value)) return root;
        }
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                View found = findTextView(group.getChildAt(i), text);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static View findByDescription(View root, String description) {
        if (root == null) return null;
        CharSequence value = root.getContentDescription();
        if (value != null && description.contentEquals(value)) return root;
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                View found = findByDescription(group.getChildAt(i), description);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static void require(boolean condition, String message, int[] assertions) {
        if (!condition) {
            throw new AssertionError(message);
        }
        assertions[0]++;
    }
}
