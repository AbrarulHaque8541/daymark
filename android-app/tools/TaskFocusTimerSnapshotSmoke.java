package com.abrar.daymark;

import java.io.IOException;
import java.util.Arrays;

public final class TaskFocusTimerSnapshotSmoke {
    private static int assertions;

    private TaskFocusTimerSnapshotSmoke() { }

    public static void main(String[] args) throws Exception {
        stopwatchSameBootRestore();
        countdownProgressAndExpiry();
        rebootAndUnknownBootRestore();
        pausedAndFinishedRestore();
        tombstoneAndCorruption();
        invalidClocksAreRejected();
        System.out.println("PASS focus timer encrypted snapshot codec: " + assertions + " assertions");
    }

    private static void stopwatchSameBootRestore() throws Exception {
        TaskFocusTimer timer = TaskFocusTimer.start("task-1", TaskFocusTimer.Mode.STOPWATCH, 0, 1_000);
        byte[] payload = TaskFocusTimerSnapshotCodec.encode(timer, 11_000, 900_000, 7);
        TaskFocusTimer restored = TaskFocusTimerSnapshotCodec.restore(payload, 16_000, 1, 7);
        check(restored != null && restored.isRunning(), "same-boot running stopwatch restores running");
        check(restored.elapsedMsAt(16_000) == 15_000, "same-boot restore uses monotonic delta");
        check(restored.taskId().equals("task-1"), "snapshot retains only task identity");
    }

    private static void countdownProgressAndExpiry() throws Exception {
        long target = 25L * 60_000L;
        TaskFocusTimer timer = TaskFocusTimer.start("task-2", TaskFocusTimer.Mode.COUNTDOWN, target, 0);
        byte[] payload = TaskFocusTimerSnapshotCodec.encode(timer, 5L * 60_000L, 300_000, 2);
        TaskFocusTimer restored = TaskFocusTimerSnapshotCodec.restore(
                payload, 10L * 60_000L, 1, 2);
        check(restored.isRunning(), "countdown remains running before expiry");
        check(restored.remainingMsAt(10L * 60_000L) == 15L * 60_000L,
                "countdown remaining time survives save/restore");
        check(restored.progressPermilleAt(10L * 60_000L) == 400,
                "countdown progress survives save/restore");

        byte[] expired = TaskFocusTimerSnapshotCodec.encode(timer, target, 900_000, 2);
        TaskFocusTimer finished = TaskFocusTimerSnapshotCodec.restore(expired, 100, 900_001, 3);
        check(finished.isFinished(), "expired countdown restores finished across reboot");
        check(finished.remainingMsAt(100) == 0, "expired countdown never has negative remaining time");
    }

    private static void rebootAndUnknownBootRestore() throws Exception {
        TaskFocusTimer timer = TaskFocusTimer.start("task-3", TaskFocusTimer.Mode.STOPWATCH, 0, 0);
        byte[] payload = TaskFocusTimerSnapshotCodec.encode(timer, 60_000, 10_000_000, 8);
        TaskFocusTimer rebooted = TaskFocusTimerSnapshotCodec.restore(payload, 500, 10_180_000, 9);
        check(rebooted.isRunning(), "known reboot preserves running state");
        check(rebooted.elapsedMsAt(500) == 240_000, "known reboot includes bounded wall-clock downtime");

        byte[] unknown = TaskFocusTimerSnapshotCodec.encode(timer, 60_000, 10_000_000, -1);
        TaskFocusTimer safe = TaskFocusTimerSnapshotCodec.restore(unknown, 10, 99_000_000, -1);
        check(safe.isPaused(), "unknown boot identity restores paused");
        check(safe.elapsedMsAt(10) == 60_000, "unknown boot does not invent elapsed time");
    }

    private static void pausedAndFinishedRestore() throws Exception {
        TaskFocusTimer running = TaskFocusTimer.start("task-4", TaskFocusTimer.Mode.STOPWATCH, 0, 0);
        TaskFocusTimer paused = running.pause(12_000);
        byte[] pausedBytes = TaskFocusTimerSnapshotCodec.encode(paused, 12_000, 100_000, 4);
        TaskFocusTimer restoredPaused = TaskFocusTimerSnapshotCodec.restore(pausedBytes, 90_000, 9_000_000, 4);
        check(restoredPaused.isPaused() && restoredPaused.elapsedMsAt(90_000) == 12_000,
                "paused session stays paused without accumulating downtime");

        TaskFocusTimer finished = paused.finish(12_000);
        byte[] finishedBytes = TaskFocusTimerSnapshotCodec.encode(finished, 12_000, 100_000, 4);
        TaskFocusTimer restoredFinished = TaskFocusTimerSnapshotCodec.restore(finishedBytes, 90_000, 9_000_000, 4);
        check(restoredFinished.isFinished() && restoredFinished.elapsedMsAt(90_000) == 12_000,
                "finished stopwatch remains frozen");
    }

    private static void tombstoneAndCorruption() throws Exception {
        byte[] tombstone = TaskFocusTimerSnapshotCodec.encode(null, 0, 0, -1);
        check(TaskFocusTimerSnapshotCodec.restore(tombstone, 0, 0, -1) == null,
                "empty snapshot tombstone means no active session");
        expectIOException(() -> TaskFocusTimerSnapshotCodec.restore(
                Arrays.copyOf(tombstone, tombstone.length - 1), 0, 0, -1),
                "truncated snapshot rejected");
        byte[] trailing = Arrays.copyOf(tombstone, tombstone.length + 1);
        expectIOException(() -> TaskFocusTimerSnapshotCodec.restore(trailing, 0, 0, -1),
                "trailing bytes rejected");
        byte[] badMagic = tombstone.clone();
        badMagic[0] = 'X';
        expectIOException(() -> TaskFocusTimerSnapshotCodec.restore(badMagic, 0, 0, -1),
                "unknown magic rejected");
    }

    private static void invalidClocksAreRejected() throws Exception {
        TaskFocusTimer timer = TaskFocusTimer.start("task-5", TaskFocusTimer.Mode.STOPWATCH, 0, 0);
        assertions++;
        try {
            TaskFocusTimerSnapshotCodec.encode(timer, -1, 1, 1);
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError("negative elapsed clock must be rejected");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIOException(IoAction action, String message) {
        assertions++;
        try {
            action.run();
        } catch (IOException expected) {
            return;
        } catch (Exception unexpected) {
            throw new AssertionError(message, unexpected);
        }
        throw new AssertionError(message);
    }

    private interface IoAction { void run() throws Exception; }
}
