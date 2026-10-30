package com.abrar.daymark;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Small, versioned plaintext payload for the independently encrypted active focus session.
 * Stores only a task ID and timer clocks/state; never stores the task title or task snapshot.
 */
final class TaskFocusTimerSnapshotCodec {
    private static final byte[] MAGIC = new byte[] { 'D', 'F', 'T', '1' };
    private static final int VERSION = 1;
    private static final int MAX_PAYLOAD_BYTES = 1024;
    private static final int MAX_TASK_ID_CHARS = 128;
    private static final int MAX_TASK_ID_BYTES = 512;

    private TaskFocusTimerSnapshotCodec() { }

    static byte[] encode(TaskFocusTimer timer, long nowElapsedRealtimeMs,
                         long nowWallClockMs, int bootCount) throws IOException {
        if (nowElapsedRealtimeMs < 0 || nowWallClockMs < 0 || bootCount < -1) {
            throw new IllegalArgumentException("Invalid focus timer persistence clocks.");
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.write(MAGIC);
            out.writeByte(VERSION);
            out.writeBoolean(timer != null);
            if (timer != null) {
                TaskFocusTimer.SavedState saved =
                        timer.save(nowElapsedRealtimeMs, nowWallClockMs, bootCount);
                byte[] taskId = saved.taskId.getBytes(StandardCharsets.UTF_8);
                if (saved.taskId.length() > MAX_TASK_ID_CHARS || taskId.length == 0
                        || taskId.length > MAX_TASK_ID_BYTES) {
                    throw new IOException("Focus timer task identity is outside the storage bound.");
                }
                out.writeShort(taskId.length);
                out.write(taskId);
                out.writeByte(saved.mode.ordinal());
                out.writeByte(saved.status.ordinal());
                out.writeLong(saved.targetDurationMs);
                out.writeLong(saved.elapsedMs);
                out.writeLong(saved.savedAtElapsedRealtimeMs);
                out.writeLong(saved.savedAtWallClockMs);
                out.writeInt(saved.bootCount);
            }
        }
        byte[] result = bytes.toByteArray();
        if (result.length > MAX_PAYLOAD_BYTES) {
            throw new IOException("Focus timer snapshot exceeds the storage bound.");
        }
        return result;
    }

    static TaskFocusTimer restore(byte[] payload, long nowElapsedRealtimeMs,
                                  long nowWallClockMs, int currentBootCount) throws IOException {
        if (payload == null || payload.length < MAGIC.length + 2
                || payload.length > MAX_PAYLOAD_BYTES
                || nowElapsedRealtimeMs < 0 || nowWallClockMs < 0 || currentBootCount < -1) {
            throw new IOException("Focus timer snapshot is missing or outside its bounds.");
        }
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(payload))) {
            byte[] magic = new byte[MAGIC.length];
            in.readFully(magic);
            for (int i = 0; i < MAGIC.length; i++) {
                if (magic[i] != MAGIC[i]) throw new IOException("Focus timer snapshot magic is invalid.");
            }
            if (in.readUnsignedByte() != VERSION) {
                throw new IOException("Focus timer snapshot version is unsupported.");
            }
            boolean present = in.readBoolean();
            if (!present) {
                requireEnd(in);
                return null;
            }

            int idLength = in.readUnsignedShort();
            if (idLength < 1 || idLength > MAX_TASK_ID_BYTES) {
                throw new IOException("Focus timer task identity length is invalid.");
            }
            byte[] idBytes = new byte[idLength];
            in.readFully(idBytes);
            String taskId = new String(idBytes, StandardCharsets.UTF_8);
            if (taskId.trim().isEmpty() || taskId.length() > MAX_TASK_ID_CHARS) {
                throw new IOException("Focus timer task identity is invalid.");
            }

            int modeValue = in.readUnsignedByte();
            int statusValue = in.readUnsignedByte();
            if (modeValue >= TaskFocusTimer.Mode.values().length
                    || statusValue >= TaskFocusTimer.Status.values().length) {
                throw new IOException("Focus timer mode or status is invalid.");
            }
            TaskFocusTimer.Mode mode = TaskFocusTimer.Mode.values()[modeValue];
            TaskFocusTimer.Status status = TaskFocusTimer.Status.values()[statusValue];
            long target = in.readLong();
            long elapsed = in.readLong();
            long savedAtElapsed = in.readLong();
            long savedAtWall = in.readLong();
            int savedBootCount = in.readInt();
            requireEnd(in);

            if (savedBootCount < -1 || elapsed < 0
                    || elapsed > TaskFocusTimer.MAX_ELAPSED_MS
                    || savedAtElapsed < 0 || savedAtWall < 0
                    || (mode == TaskFocusTimer.Mode.STOPWATCH && target != 0)
                    || (mode == TaskFocusTimer.Mode.COUNTDOWN
                        && (target < 1000L || target > TaskFocusTimer.MAX_COUNTDOWN_MS))) {
                throw new IOException("Focus timer snapshot values are invalid.");
            }

            return restoreValidated(taskId, mode, status, target, elapsed,
                    savedAtElapsed, savedAtWall, savedBootCount,
                    nowElapsedRealtimeMs, nowWallClockMs, currentBootCount);
        } catch (IOException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new IOException("Focus timer snapshot is malformed.", exception);
        }
    }

    private static TaskFocusTimer restoreValidated(
            String taskId, TaskFocusTimer.Mode mode, TaskFocusTimer.Status status,
            long target, long elapsed, long savedAtElapsed, long savedAtWall, int savedBoot,
            long nowElapsed, long nowWall, int currentBoot) {
        if (status == TaskFocusTimer.Status.RUNNING) {
            if (savedBoot >= 0 && currentBoot >= 0 && savedBoot == currentBoot) {
                long delta = Math.max(0, nowElapsed - savedAtElapsed);
                elapsed = Math.min(TaskFocusTimer.MAX_ELAPSED_MS, saturatedAdd(elapsed, delta));
            } else if (savedBoot >= 0 && currentBoot >= 0) {
                long delta = Math.max(0, nowWall - savedAtWall);
                delta = Math.min(delta, TaskFocusTimer.MAX_REBOOT_GAP_MS);
                elapsed = Math.min(TaskFocusTimer.MAX_ELAPSED_MS, saturatedAdd(elapsed, delta));
            } else {
                status = TaskFocusTimer.Status.PAUSED;
            }
        }
        if (mode == TaskFocusTimer.Mode.COUNTDOWN && elapsed >= target) {
            status = TaskFocusTimer.Status.FINISHED;
        }

        // Rebuild through the timer's public state transitions. This keeps the engine's
        // constructor private and preserves the same monotonic-clock invariants.
        TaskFocusTimer seed = TaskFocusTimer.start(taskId, mode, target, 0);
        TaskFocusTimer paused = seed.pause(elapsed);
        if (status == TaskFocusTimer.Status.RUNNING) return paused.resume(nowElapsed);
        if (status == TaskFocusTimer.Status.FINISHED) return paused.finish(nowElapsed);
        return paused;
    }

    private static long saturatedAdd(long left, long right) {
        if (right > 0 && left > Long.MAX_VALUE - right) return Long.MAX_VALUE;
        return left + right;
    }

    private static void requireEnd(DataInputStream in) throws IOException {
        if (in.read() != -1) throw new IOException("Focus timer snapshot has trailing data.");
    }
}
