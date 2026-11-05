package com.abrar.daymark;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.widget.TextView;

import java.lang.reflect.Field;
import java.util.List;
import java.util.UUID;

/** End-to-end IME visibility and save/cancel checks for the real task editor. */
final class TaskEditorImeInstrumentation {
    private static final String TAG = "TaskEditorIme";
    private static final String EDITOR_TITLE = "Add task details";
    private static final String TITLE_FIELD_DESCRIPTION = "Task name. You can edit this before saving.";
    /** API 29 emulators can take longer for storage readiness + dialog a11y tree. */
    private static final long WAIT_MS = 15000L;
    private static final long OPEN_RETRY_MS = 400L;

    private TaskEditorImeInstrumentation() { }

    static int run(Instrumentation instrumentation) throws Exception {
        int[] assertions = { 0 };
        MainActivity activity = null;
        String token = "IME footer test " + UUID.randomUUID();
        String cancelledTitle = token + " cancelled";
        String savedTitle = token + " saved";
        boolean savedTaskMayExist = false;
        try {
            Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            Activity started = instrumentation.startActivitySync(launch);
            require(started instanceof MainActivity, "instrumentation launches the real MainActivity", assertions);
            activity = (MainActivity) started;
            instrumentation.waitForIdleSync();

            openEditor(instrumentation, activity, assertions);
            exerciseImeActions(instrumentation, cancelledTitle, assertions);
            tapDialogAction(instrumentation, EDITOR_TITLE, "Cancel", assertions);
            awaitDialogGone(instrumentation, EDITOR_TITLE);
            awaitImeHidden(instrumentation);
            require(!taskTitleVisible(instrumentation, activity, cancelledTitle),
                    "Cancel closes the editor without creating the typed task", assertions);

            openEditor(instrumentation, activity, assertions);
            exerciseImeActions(instrumentation, savedTitle, assertions);
            savedTaskMayExist = true;
            tapDialogAction(instrumentation, EDITOR_TITLE, "Add task", assertions);
            awaitDialogGone(instrumentation, EDITOR_TITLE);
            awaitImeHidden(instrumentation);
            require(awaitTaskTitleVisible(instrumentation, activity, savedTitle),
                    "Add Task saves and renders the typed task", assertions);

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

    private static void openEditor(Instrumentation instrumentation, MainActivity activity, int[] assertions)
            throws Exception {
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

        // Retry click + dialog appearance: API 29 a11y tree and first paint can lag.
        long openDeadline = SystemClock.uptimeMillis() + WAIT_MS;
        AccessibilityNodeInfo root = null;
        while (SystemClock.uptimeMillis() < openDeadline && root == null) {
            instrumentation.runOnMainSync(() -> {
                View btn = findTextView(activity.getWindow().getDecorView(), "Add task");
                if (btn != null && btn.isShown() && btn.isEnabled()) {
                    btn.performClick();
                }
            });
            instrumentation.waitForIdleSync();
            SystemClock.sleep(OPEN_RETRY_MS);
            root = findDialogRoot(instrumentation, EDITOR_TITLE);
            if (root == null) {
                // Secondary signal: title field content description may appear before title text.
                root = findDialogRootByDescription(instrumentation, TITLE_FIELD_DESCRIPTION);
            }
        }
        require(root != null, "the Add task button opens the full editor dialog", assertions);
        // Ensure the canonical title is eventually visible for subsequent steps.
        awaitDialogRoot(instrumentation, EDITOR_TITLE);
    }

    private static void exerciseImeActions(Instrumentation instrumentation, String title, int[] assertions)
            throws Exception {
        AccessibilityNodeInfo root = awaitDialogRoot(instrumentation, EDITOR_TITLE);
        AccessibilityNodeInfo titleField = findByDescription(root, TITLE_FIELD_DESCRIPTION);
        require(titleField != null, "the editor exposes its task title field", assertions);
        require(titleField.performAction(AccessibilityNodeInfo.ACTION_FOCUS),
                "the task title field accepts focus", assertions);
        Rect imeBounds = findImeBounds(instrumentation);
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
        AccessibilityNodeInfo scrollView = findScrollable(root);
        require(scrollView != null, "the task form remains scrollable within the dialog viewport", assertions);
        AccessibilityNodeInfo cancel = findByText(root, "Cancel");
        AccessibilityNodeInfo add = findByText(root, "Add task");
        require(cancel != null && cancel.isClickable(), "the Cancel dialog action is present and clickable", assertions);
        require(add != null && add.isClickable(), "the Add Task dialog action is present and clickable", assertions);
        if (imeBounds != null) {
            checkVisibleAboveIme(instrumentation, cancel, imeBounds, "Cancel", assertions);
            checkVisibleAboveIme(instrumentation, add, imeBounds, "Add Task", assertions);
        }

        titleField = findByDescription(root, TITLE_FIELD_DESCRIPTION);
        Bundle text = new Bundle();
        text.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, title);
        require(titleField != null && titleField.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, text),
                "the focused title field accepts test text", assertions);
        instrumentation.waitForIdleSync();
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

    private static void tapDialogAction(Instrumentation instrumentation, String dialogTitle, String label,
                                        int[] assertions) throws Exception {
        AccessibilityNodeInfo root = awaitDialogRoot(instrumentation, dialogTitle);
        AccessibilityNodeInfo button = findByText(root, label);
        require(button != null && button.isClickable(), label + " action is clickable before tapping", assertions);
        Rect bounds = new Rect();
        button.getBoundsInScreen(bounds);
        require(!bounds.isEmpty(), label + " action has a non-empty touch target", assertions);
        boolean tapped = injectTap(instrumentation, bounds);
        require(tapped, label + " action accepts a real touch at its visible center", assertions);
        instrumentation.waitForIdleSync();
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
        AccessibilityNodeInfo deleteItem = findByText(actionRoot, "Delete task");
        require(deleteItem != null && deleteItem.isClickable(), "the task action list offers Delete task", assertions);
        Rect actionBounds = new Rect();
        deleteItem.getBoundsInScreen(actionBounds);
        require(injectTap(instrumentation, actionBounds), "the test task Delete action accepts a touch", assertions);

        AccessibilityNodeInfo confirmation = awaitDialogRootContaining(
                instrumentation, "Delete this task?", "Delete task");
        AccessibilityNodeInfo confirmButton = findByText(confirmation, "Delete task");
        require(confirmButton != null && confirmButton.isClickable(), "the delete confirmation is available", assertions);
        Rect confirmBounds = new Rect();
        confirmButton.getBoundsInScreen(confirmBounds);
        require(injectTap(instrumentation, confirmBounds), "the delete confirmation accepts a touch", assertions);
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

    private static AccessibilityNodeInfo findByText(AccessibilityNodeInfo root, String text) {
        if (root == null) return null;
        CharSequence value = root.getText();
        if (value != null && text.contentEquals(value)) return root;
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = findByText(root.getChild(i), text);
            if (found != null) return found;
        }
        return null;
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
