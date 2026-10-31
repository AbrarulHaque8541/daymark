package com.abrar.daymark;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Staged load watchdog for the embedded browser WebView.
 *
 * <p>Addresses the white-viewport symptom (#221) by making load progress visible and bounded:
 * <ul>
 *   <li>5s after {@code loadUrl} with no {@code onPageStarted}: status hint "Still opening…"</li>
 *   <li>15s with no {@code onPageFinished}: one automatic reload (if {@link BrowserSelfHealingPolicy} allows)</li>
 *   <li>25s with no {@code onPageFinished}: final "The page did not open" with tap-to-retry callback</li>
 * </ul>
 *
 * <p>All events are recorded in a bounded in-memory ring buffer (max 50) with redacted URLs
 * for the Diagnostics report. Thread-safe; lifecycle-gated.
 */
final class BrowserLoadWatchdog {
    private static final String TAG = "DaymarkBrowser";
    private static final int MAX_EVENTS = 50;
    private static final long STAGE_HINT_MS = 5_000L;
    private static final long STAGE_RETRY_MS = 15_000L;
    private static final long STAGE_FAIL_MS = 25_000L;

    /** Callback interface for watchdog stage transitions. */
    interface Listener {
        void onStageHint(String address);
        void onStageRetry(String address);
        void onStageFail(String address);
        void onLoadStarted(String address);
        void onLoadFinished(String address);
        void onLoadError(String address, int errorCode, String description);
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    // Handler.removeCallbacks requires the same Runnable instance passed to postDelayed.
    private final Runnable hintRunnable = this::fireHint;
    private final Runnable retryRunnable = this::fireRetry;
    private final Runnable failRunnable = this::fireFail;
    private final Deque<String> events = new ArrayDeque<>();
    private Listener listener;
    private BrowserSelfHealingPolicy healingPolicy;

    private String pendingAddress;
    private long loadStartMs;
    private boolean hintFired;
    private boolean retryFired;
    private boolean failFired;
    private boolean paused;

    BrowserLoadWatchdog() {}

    void setListener(Listener listener) {
        this.listener = listener;
    }

    void setHealingPolicy(BrowserSelfHealingPolicy policy) {
        this.healingPolicy = policy;
    }

    /** Call when a new loadUrl is issued. Arms all three watchdog stages. */
    synchronized void onLoadRequested(String address) {
        onLoadRequested(address, true);
    }

    /**
     * Same as {@link #onLoadRequested(String)}, but can skip resetting the self-healing
     * budget. Re-arms after an auto-retry must NOT refresh the budget, otherwise the
     * bounded one-retry guarantee becomes an unbounded reload loop.
     */
    synchronized void onLoadRequested(String address, boolean resetHealingBudget) {
        cancelStages();
        pendingAddress = redact(address);
        loadStartMs = SystemClock.elapsedRealtime();
        hintFired = false;
        retryFired = false;
        failFired = false;
        record("load-requested: " + pendingAddress);
        Log.i(TAG, "load-requested: " + pendingAddress);
        if (resetHealingBudget && healingPolicy != null) healingPolicy.onUserNavigation(address);
        if (!paused) {
            handler.postDelayed(hintRunnable, STAGE_HINT_MS);
            handler.postDelayed(retryRunnable, STAGE_RETRY_MS);
            handler.postDelayed(failRunnable, STAGE_FAIL_MS);
        }
    }

    /** Call from WebViewClient.onPageStarted. Cancels hint stage. */
    synchronized void onPageStarted(String url) {
        record("page-started: " + redact(url));
        Log.i(TAG, "page-started: " + redact(url));
        handler.removeCallbacks(hintRunnable);
        hintFired = true;
    }

    /** Call from WebViewClient.onPageFinished. Cancels all stages. */
    synchronized void onPageFinished(String url) {
        cancelStages();
        pendingAddress = null;
        hintFired = true;
        retryFired = true;
        failFired = true;
        record("page-finished: " + redact(url));
        Log.i(TAG, "page-finished: " + redact(url));
        if (healingPolicy != null) healingPolicy.onPageLoaded(url);
        if (listener != null) listener.onLoadFinished(url);
    }

    /** Call from WebViewClient.onReceivedError. Cancels retry/fail stages, reports error. */
    synchronized void onReceivedError(String url, int errorCode, String description) {
        cancelStages();
        pendingAddress = null;
        hintFired = true;
        retryFired = true;
        failFired = true;
        String safeDesc = description == null ? "unknown" : description.replaceAll("[\r\n]", " ");
        record("load-error: " + redact(url) + " code=" + errorCode + " " + safeDesc);
        Log.w(TAG, "load-error: " + redact(url) + " code=" + errorCode + " " + safeDesc);
        if (listener != null) listener.onLoadError(url, errorCode, safeDesc);
    }

    /** Call when renderer dies. Triggers immediate fail with recovery option. */
    synchronized void onRendererGone(String url) {
        cancelStages();
        pendingAddress = null;
        failFired = true;
        record("renderer-gone: " + redact(url));
        Log.e(TAG, "renderer-gone: " + redact(url));
        if (listener != null) listener.onStageFail(url);
    }

    /** Pause watchdog (Activity.onPause). Removes pending callbacks. */
    synchronized void pause() {
        paused = true;
        handler.removeCallbacks(hintRunnable);
        handler.removeCallbacks(retryRunnable);
        handler.removeCallbacks(failRunnable);
        record("watchdog-paused");
    }

    /** Resume watchdog (Activity.onResume). Re-arms if a load was in flight.
     *  Overdue stages are posted with zero delay so they fire on the next dispatch. */
    synchronized void resume() {
        if (!paused) return;
        paused = false;
        record("watchdog-resumed");
        if (pendingAddress != null && !failFired) {
            long elapsed = SystemClock.elapsedRealtime() - loadStartMs;
            if (!hintFired) {
                long delay = Math.max(0L, STAGE_HINT_MS - elapsed);
                handler.postDelayed(hintRunnable, delay);
            }
            if (!retryFired) {
                long delay = Math.max(0L, STAGE_RETRY_MS - elapsed);
                handler.postDelayed(retryRunnable, delay);
            }
            if (!failFired) {
                long delay = Math.max(0L, STAGE_FAIL_MS - elapsed);
                handler.postDelayed(failRunnable, delay);
            }
        }
    }

    /** Returns a snapshot of recorded events for the Diagnostics report. */
    synchronized List<String> snapshotEvents() {
        return new ArrayList<>(events);
    }

    /** Clears all recorded events. */
    synchronized void clearEvents() {
        events.clear();
    }

    /** Cancels all pending stages without touching the paused flag (teardown / re-arm). */
    synchronized void cancel() {
        cancelStages();
        pendingAddress = null;
    }

    private void fireHint() {
        final String address;
        synchronized (this) {
            if (paused || hintFired || pendingAddress == null) return;
            hintFired = true;
            address = pendingAddress;
            record("watchdog-hint: " + address);
            Log.i(TAG, "watchdog-hint (5s): " + address);
        }
        if (listener != null) listener.onStageHint(address);
    }

    private void fireRetry() {
        final String address;
        synchronized (this) {
            if (paused || retryFired || failFired || pendingAddress == null) return;
            retryFired = true;
            address = pendingAddress;
            record("watchdog-retry: " + address);
            Log.i(TAG, "watchdog-retry (15s): " + address);
        }
        // The listener decides recovery via BrowserSelfHealingPolicy.shouldRecover with the
        // full URL; this class only carries the redacted origin, which must not reset the budget.
        if (listener != null) listener.onStageRetry(address);
    }

    private void fireFail() {
        final String address;
        synchronized (this) {
            if (paused || failFired || pendingAddress == null) return;
            failFired = true;
            address = pendingAddress;
            record("watchdog-fail: " + address);
            Log.e(TAG, "watchdog-fail (25s): " + address + " — page did not open");
        }
        if (listener != null) listener.onStageFail(address);
    }

    private void cancelStages() {
        handler.removeCallbacks(hintRunnable);
        handler.removeCallbacks(retryRunnable);
        handler.removeCallbacks(failRunnable);
    }

    private void record(String event) {
        if (events.size() >= MAX_EVENTS) events.pollFirst();
        events.addLast(event);
    }

    /** Redacts URL to origin-only: strips path, query, fragment, and credentials. */
    private static String redact(String url) {
        if (url == null) return "null";
        try {
            int schemeEnd = url.indexOf("://");
            if (schemeEnd < 0) return "[non-http]";
            int authorityStart = schemeEnd + 3;

            // A query or fragment can immediately follow the authority (without a slash).
            // Stop at the first URI delimiter so diagnostics never retain secrets.
            int authorityEnd = url.length();
            int pathStart = url.indexOf('/', authorityStart);
            int queryStart = url.indexOf('?', authorityStart);
            int fragmentStart = url.indexOf('#', authorityStart);
            if (pathStart >= 0) authorityEnd = Math.min(authorityEnd, pathStart);
            if (queryStart >= 0) authorityEnd = Math.min(authorityEnd, queryStart);
            if (fragmentStart >= 0) authorityEnd = Math.min(authorityEnd, fragmentStart);

            int atSign = url.lastIndexOf('@', authorityEnd - 1);
            int hostStart = (atSign >= 0 && atSign < authorityEnd)
                    ? atSign + 1 : authorityStart;
            return url.substring(0, schemeEnd + 3) + url.substring(hostStart, authorityEnd);
        } catch (Exception e) {
            return "[redact-error]";
        }
    }
}
