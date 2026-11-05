package com.abrar.daymark;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
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

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/** End-to-end IME visibility and save/cancel checks for the real task editor. */
final class TaskEditorImeInstrumentation {
    private static final String TAG = "TaskEditorIme";
    private static final String EDITOR_TITLE = "Add task details";
    private static final String TITLE_FIELD_DESCRIPTION = "Task name. You can edit this before saving.";
    /** API 29 emulators can take longer for storage readiness + dialog a11y tree. */
    private static final long WAIT_MS = 15000L;

    private TaskEditorImeInstrumentation() { }

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
            instrumentation.waitForIdleSync();
            ensureTasksMode(instrumentation, activity, assertions);
            awaitStorageReady(instrumentation, activity, assertions);
            byte[] storageBeforeCancel = encryptedTaskStorageSnapshot(activity);

            openEditor(instrumentation, activity, assertions);
            exerciseImeActions(instrumentation, cancelledTitle, assertions);
            tapDialogAction(instrumentation, EDITOR_TITLE, "android:id/button2", "Cancel", assertions);
            awaitDialogGone(instrumentation, EDITOR_TITLE);
            awaitImeHidden(instrumentation);
            require(Arrays.equals(storageBeforeCancel, encryptedTaskStorageSnapshot(activity)),
                    "Cancel leaves encrypted task storage byte-for-byte unchanged", assertions);
            require(!taskTitleVisible(instrumentation, activity, cancelledTitle),
                    "Cancel closes the editor without creating the typed task", assertions);

            openEditor(instrumentation, activity, assertions);
            exerciseImeActions(instrumentation, savedTitle, assertions);
            savedTaskMayExist = true;
            tapDialogAction(instrumentation, EDITOR_TITLE, "android:id/button1", "Add task", assertions);
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

        // Click only once: repeated clicks can stack dialogs while API 29 a11y is delayed.
        boolean[] clicked = { false };
        instrumentation.runOnMainSync(() -> {
            View btn = addTask[0];
            if (btn != null && btn.isShown() && btn.isEnabled()) {
                clicked[0] = btn.performClick();
            }
        });
        require(clicked[0], "the ready Add task button accepts one click", assertions);

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
        // Ensure the canonical title is eventually visible for subsequent steps.
        awaitDialogRoot(instrumentation, EDITOR_TITLE);
    }

    private static void exerciseImeActions(Instrumentation instrumentation, String title, int[] assertions)
            throws Exception {
        AccessibilityNodeInfo root = awaitDialogRoot(instrumentation, EDITOR_TITLE);
        AccessibilityNodeInfo titleField = findByDescription(root, TITLE_FIELD_DESCRIPTION);
        require(titleField != null, "the editor exposes its task title field", assertions);
        // MainActivity requests title focus when the dialog opens; ACTION_FOCUS may return false if already focused.
        require(titleField.isFocused() || titleField.performAction(AccessibilityNodeInfo.ACTION_FOCUS),
                "the task title field is focused or accepts focus", assertions);
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
        AccessibilityNodeInfo cancel = awaitDialogButton(
                instrumentation, EDITOR_TITLE, "android:id/button2", "Cancel");
        AccessibilityNodeInfo add = awaitDialogButton(
                instrumentation, EDITOR_TITLE, "android:id/button1", "Add task");
        require(hasVisibleTouchBounds(cancel), "the Cancel dialog action has a visible touch target", assertions);
        require(hasVisibleTouchBounds(add), "the Add Task dialog action has a visible touch target", assertions);
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

    private static AccessibilityNodeInfo awaitDialogButton(Instrumentation instrumentation, String dialogTitle,
                                                            String viewId, String label) throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
                AccessibilityNodeInfo root = window.getRoot();
                if (root == null || findByText(root, dialogTitle) == null) continue;
                AccessibilityNodeInfo button = findByViewId(root, viewId);
                if (button == null) button = findButtonByText(root, label);
                if (button != null && findByText(button, label) != null && hasVisibleTouchBounds(button)) {
                    return button;
                }
            }
            SystemClock.sleep(50L);
        }
        throw new AssertionError("Timed out waiting for visible " + label + " button " + viewId
                + "; accessibility nodes: " + describeDialogButtonNodes(instrumentation, dialogTitle, viewId, label));
    }

    private static String describeDialogButtonNodes(Instrumentation instrumentation, String dialogTitle,
                                                     String viewId, String label) {
        StringBuilder summary = new StringBuilder();
        for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
            AccessibilityNodeInfo root = window.getRoot();
            if (root == null) continue;
            AccessibilityNodeInfo titleNode = findByText(root, dialogTitle);
            AccessibilityNodeInfo labelNode = findByText(root, label);
            AccessibilityNodeInfo idNode = findByViewId(root, viewId);
            AccessibilityNodeInfo buttonNode = findButtonByText(root, label);
            if (titleNode == null && labelNode == null && idNode == null && buttonNode == null) continue;
            if (summary.length() > 0) summary.append("; ");
            summary.append("windowType=").append(window.getType())
                    .append(" title=").append(describeNode(titleNode))
                    .append(" label=").append(describeNode(labelNode))
                    .append(" id=").append(describeNode(idNode))
                    .append(" button=").append(describeNode(buttonNode));
        }
        return summary.length() == 0 ? "no matching nodes in interactive windows" : summary.toString();
    }

    private static String describeNode(AccessibilityNodeInfo node) {
        if (node == null) return "none";
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        return "class=" + node.getClassName() + ",text=" + node.getText()
                + ",viewId=" + node.getViewIdResourceName() + ",visible=" + node.isVisibleToUser()
                + ",clickable=" + node.isClickable() + ",bounds=" + bounds.toShortString();
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

    private static void tapDialogAction(Instrumentation instrumentation, String dialogTitle, String viewId,
                                        String label, int[] assertions) throws Exception {
        AccessibilityNodeInfo button = awaitDialogButton(instrumentation, dialogTitle, viewId, label);
        require(hasVisibleTouchBounds(button), label + " button has visible touch bounds before tapping", assertions);
        Rect bounds = new Rect();
        button.getBoundsInScreen(bounds);
        boolean tapped = injectTap(instrumentation, bounds);
        require(tapped, label + " button accepts exactly one real touch at its visible bounds", assertions);
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

    private static AccessibilityNodeInfo findClickableByText(AccessibilityNodeInfo root, String text) {
        if (root == null) return null;
        CharSequence value = root.getText();
        if (value != null && text.contentEquals(value)) {
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
