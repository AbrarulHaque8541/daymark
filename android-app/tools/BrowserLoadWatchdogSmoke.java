package com.abrar.daymark;

import android.os.Handler;
import android.os.SystemClock;

/** Deterministic regression tests for staged watchdog callback cancellation and lifecycle. */
public final class BrowserLoadWatchdogSmoke {
    private static final String URL = "https://example.com/private/path?token=must-not-leak";
    private static final class Events implements BrowserLoadWatchdog.Listener {
        int hints;
        int retries;
        int failures;
        int finished;
        int errors;
        String lastAddress;
        @Override public void onStageHint(String address) { hints++; lastAddress = address; }
        @Override public void onStageRetry(String address) { retries++; lastAddress = address; }
        @Override public void onStageFail(String address) { failures++; lastAddress = address; }
        @Override public void onLoadStarted(String address) {}
        @Override public void onLoadFinished(String address) { finished++; lastAddress = address; }
        @Override public void onLoadError(String address, int errorCode, String description) {
            errors++; lastAddress = address;
        }
    }

    private static BrowserLoadWatchdog create(Events events) {
        BrowserLoadWatchdog watchdog = new BrowserLoadWatchdog();
        watchdog.setListener(events);
        watchdog.setHealingPolicy(new BrowserSelfHealingPolicy());
        return watchdog;
    }

    private static void advance(long millis) {
        SystemClock.advanceTimeBy(millis);
        Handler.dispatchDueTasks();
    }

    public static void main(String[] args) {
        SystemClock.resetForTests();
        Handler.clearForTests();

        // Success must cancel every queued stage, not merely the same-looking method reference.
        Events success = new Events();
        BrowserLoadWatchdog watchdog = create(success);
        assert "Opening\u2026".equals(watchdog.currentStatus()) == false : "idle before load";
        watchdog.onLoadRequested(URL);
        assert "Opening\u2026".equals(watchdog.currentStatus()) : "status after request";
        advance(5_000L);
        assert success.hints == 1 : "5s hint must fire once";
        assert "Still opening\u2026".equals(watchdog.currentStatus()) : "status after hint";
        assert "https://example.com".equals(success.lastAddress) : "diagnostics must redact path/query";
        watchdog.onPageStarted(URL);
        watchdog.onPageFinished(URL);
        assert watchdog.currentStatus() == null : "status cleared on finish";
        advance(30_000L);
        assert success.finished == 1 : "successful load callback missing";
        assert success.retries == 0 : "stale retry fired after page finish";
        assert success.failures == 0 : "stale failure fired after page finish";
        assert success.hints == 1 : "stale hint fired after page finish";

        // A main-frame error also clears all pending stage callbacks.
        Events error = new Events();
        watchdog = create(error);
        watchdog.onLoadRequested(URL);
        watchdog.onReceivedError(URL, -2, "connection failed");
        advance(30_000L);
        assert error.errors == 1 : "load error callback missing";
        assert error.retries == 0 && error.failures == 0 && error.hints == 0
                : "watchdog stage fired after load error";
        assert watchdog.currentStatus() == null : "status cleared on error";

        // Explicit teardown/cancel must be terminal for the pending navigation.
        Events cancelled = new Events();
        watchdog = create(cancelled);
        watchdog.onLoadRequested(URL);
        watchdog.cancel();
        advance(30_000L);
        assert cancelled.hints == 0 && cancelled.retries == 0 && cancelled.failures == 0
                : "watchdog callback fired after cancel";
        assert watchdog.currentStatus() == null : "status cleared on cancel";

        // Pause/resume uses monotonic elapsed time and re-arms only remaining stages.
        Events lifecycle = new Events();
        watchdog = create(lifecycle);
        watchdog.onLoadRequested(URL);
        advance(6_000L);
        watchdog.pause();
        advance(10_000L);
        watchdog.resume();
        Handler.dispatchDueTasks();
        assert lifecycle.retries == 1 : "retry stage must resume after its elapsed deadline";
        assert "Still opening\u2026 (retrying)".equals(watchdog.currentStatus()) : "status after retry";
        advance(9_000L);
        assert lifecycle.failures == 1 : "fail stage must resume at the original elapsed deadline";
        assert watchdog.currentStatus() == null : "status cleared on fail";

        System.out.println("PASS BrowserLoadWatchdogSmoke: terminal cancellation, error, cancel, pause/resume, status");
    }
}
