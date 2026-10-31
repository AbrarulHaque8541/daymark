package android.os;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Deterministic Handler test double; callback removal uses Android's identity semantics. */
public final class Handler {
    private static final List<Entry> QUEUE = new ArrayList<>();
    public Handler(Looper looper) {}
    public synchronized boolean postDelayed(Runnable callback, long delayMillis) {
        synchronized (QUEUE) {
            QUEUE.add(new Entry(this, callback,
                    SystemClock.elapsedRealtime() + Math.max(0L, delayMillis)));
        }
        return true;
    }
    public void removeCallbacks(Runnable callback) {
        synchronized (QUEUE) {
            QUEUE.removeIf(entry -> entry.owner == this && entry.callback == callback);
        }
    }
    public static void dispatchDueTasks() {
        for (int guard = 0; guard < 1000; guard++) {
            Entry next;
            synchronized (QUEUE) {
                next = QUEUE.stream()
                        .filter(entry -> entry.dueAt <= SystemClock.elapsedRealtime())
                        .min(Comparator.comparingLong(entry -> entry.dueAt))
                        .orElse(null);
                if (next != null) QUEUE.remove(next);
            }
            if (next == null) return;
            next.callback.run();
        }
        throw new AssertionError("too many scheduled callbacks; possible loop");
    }
    public static void clearForTests() {
        synchronized (QUEUE) { QUEUE.clear(); }
    }
    private static final class Entry {
        final Handler owner;
        final Runnable callback;
        final long dueAt;
        Entry(Handler owner, Runnable callback, long dueAt) {
            this.owner = owner;
            this.callback = callback;
            this.dueAt = dueAt;
        }
    }
}
