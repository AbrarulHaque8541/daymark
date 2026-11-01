package com.abrar.daymark;

/**
 * Lightweight helper for task-card right-to-left expand/collapse behaviour.
 *
 * <p>Keeps expand state and timings separate from MainActivity so the shared
 * guarded file stays smaller and the motion language stays consistent with
 * {@link UiMotionPolicy}. Pure Java – no framework dependency in the policy layer.
 *
 * <p>Intended use (wiring in a follow-up):
 * <ul>
 *   <li>Right-side chevron / control on each task row</li>
 *   <li>Expand panel slides in from the right (or content expands right-to-left)</li>
 *   <li>Panel contains: due, priority, tags, notes, subtasks, custom reminder,
 *       custom notification sound, custom vibration, Focus link – one place only</li>
 *   <li>Collapse is debounced via {@link UiMotionPolicy#shouldAcceptCollapse}</li>
 * </ul>
 */
public final class TaskCardExpandHelper {
    private TaskCardExpandHelper() {}

    /** Currently expanded task id, or null when none. */
    private static String expandedTaskId;

    /** Wall-clock ms when the current expand started (for debounce). */
    private static long expandStartedAtMs;

    public static boolean isExpanded(String taskId) {
        return taskId != null && taskId.equals(expandedTaskId);
    }

    public static void expand(String taskId, long nowMs) {
        if (taskId == null) return;
        expandedTaskId = taskId;
        expandStartedAtMs = nowMs;
    }

    public static boolean collapse(String taskId, long nowMs) {
        if (!isExpanded(taskId)) return false;
        if (!UiMotionPolicy.shouldAcceptCollapse(expandStartedAtMs, nowMs)) return false;
        expandedTaskId = null;
        expandStartedAtMs = 0L;
        return true;
    }

    public static void collapseAll() {
        expandedTaskId = null;
        expandStartedAtMs = 0L;
    }

    public static long expandDurationMs() {
        return UiMotionPolicy.CARD_EXPAND_MS;
    }
}
