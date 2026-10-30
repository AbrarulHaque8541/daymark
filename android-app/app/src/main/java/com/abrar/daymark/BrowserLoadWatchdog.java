package com.abrar.daymark;

import android.os.Handler;
import android.os.Looper;
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
        cancelStages();
        pendingAddress = redact(address);
        loadStartMs = System.currentTimeMillis();
        hintFired = false;
        retryFired = false;
        failFired = false;
        record("load-requested: " + pendingAddress);
        Log.i(TAG, "load-requested: " + pendingAddress);
        if (healingPolicy != null) healingPolicy.onUserNavigation(address);
        handler.postDelayed(this::fireHint, STAGE_HINT_MS);
        handler.postDelayed(this::fireRetry, STAGE_RETRY_MS);
        handler.postDelayed(this::fireFail, STAGE_FAIL_MS);
    }

    /** Call from WebViewClient.onPageStarted. Cancels hint stage. */
    synchronized void onPageStarted(String url) {
        record("page-started: " + redact(url));
        Log.i(TAG, "page-started: " + redact(url));
        handler.removeCallbacks(this::fireHint);
        hintFired = true;
    }

    /** Call from WebViewClient.onPageFinished. Cancels all stages. */
    synchronized void onPageFinished(String url) {
        cancelStages();
        record("page-finished: " + redact(url));
        Log.i(TAG, "page-finished: " + redact(url));
        if (healingPolicy != null) healingPolicy.onPageLoaded(url);
        if (listener != null) listener.onLoadFinished(url);
    }

    /** Call from WebViewClient.onReceivedError. Cancels retry/fail stages, reports error. */
    synchronized void onReceivedError(String url, int errorCode, String description) {
        cancelStages();
        String safeDesc = description == null ? "unknown" : description.replaceAll("[\r\n]", " ");
        record("load-error: " + redact(url) + " code=" + errorCode + " " + safeDesc);
        Log.w(TAG, "load-error: " + redact(url) + " code=" + errorCode + " " + safeDesc);
        if (listener != null) listener.onLoadError(url, errorCode, safeDesc);
    }

    /** Call when renderer dies. Triggers immediate fail with recovery option. */
    synchronized void onRendererGone(String url) {
        cancelStages();
        record("renderer-gone: " + redact(url));
        Log.e(TAG, "renderer-gone: " + redact(url));
        if (listener != null) listener.onStageFail(url);
    }

    /** Pause watchdog (Activity.onPause). Removes pending callbacks. */
    synchronized void pause() {
        paused = true;
        handler.removeCallbacks(this::fireHint);
        handler.removeCallbacks(this::fireRetry);
        handler.removeCallbacks(this::fireFail);
        record("watchdog-paused");
    }

    /** Resume watchdog (Activity.onResume). Re-arms if a load was in flight. */
    synchronized void resume() {
        if (!paused) return;
        paused = false;
        record("watchdog-resumed");
        if (pendingAddress != null && !failFired) {
            long elapsed = System.currentTimeMillis() - loadStartMs;
            if (elapsed < STAGE_HINT_MS) {
                handler.postDelayed(this::fireHint, STAGE_HINT_MS - elapsed);
                handler.postDelayed(this::fireRetry, STAGE_RETRY_MS - elapsed);
                handler.postDelayed(this::fireFail, STAGE_FAIL_MS - elapsed);
            } else if (elapsed < STAGE_RETRY_MS) {
                handler.postDelayed(this::fireRetry, STAGE_RETRY_MS - elapsed);
                handler.postDelayed(this::fireFail, STAGE_FAIL_MS - elapsed);
            } else if (elapsed < STAGE_FAIL_MS) {
                handler.postDelayed(this::fireFail, STAGE_FAIL_MS - elapsed);
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

    private void fireHint() {
        synchronized (this) {
            if (paused || hintFired || pendingAddress == null) return;
            hintFired = true;
            record("watchdog-hint: " + pendingAddress);
            Log.i(TAG, "watchdog-hint (5s): " + pendingAddress);
        }
        if (listener != null) listener.onStageHint(pendingAddress);
    }

    private void fireRetry() {
        synchronized (this) {
            if (paused || retryFired || failFired || pendingAddress == null) return;
            retryFired = true;
            boolean canRecover = healingPolicy != null && healingPolicy.shouldRecover(pendingAddress);
            record("watchdog-retry: " + pendingAddress + " auto=" + canRecover);
            Log.i(TAG, "watchdog-retry (15s): " + pendingAddress + " auto-recover=" + canRecover);
            if (listener != null) listener.onStageRetry(pendingAddress);
        }
    }

    private void fireFail() {
        synchronized (this) {
            if (paused || failFired || pendingAddress == null) return;
            failFired = true;
            record("watchdog-fail: " + pendingAddress);
            Log.e(TAG, "watchdog-fail (25s): " + pendingAddress + " — page did not open");
        }
        if (listener != null) listener.onStageFail(pendingAddress);
    }

    private void cancelStages() {
        handler.removeCallbacks(this::fireHint);
        handler.removeCallbacks(this::fireRetry);
        handler.removeCallbacks(this::fireFail);
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
            int hostStart = schemeEnd + 3;
            int pathStart = url.indexOf('/', hostStart);
            int atSign = url.indexOf('@', hostStart);
            int hostEnd = (pathStart >= 0) ? pathStart : url.length();
            if (atSign >= 0 && atSign < hostEnd) hostStart = atSign + 1;
            return url.substring(0, schemeEnd + 3) + url.substring(hostStart, hostEnd);
        } catch (Exception e) {
            return "[redact-error]";
        }
    }
}
