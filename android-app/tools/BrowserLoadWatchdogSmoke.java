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
        watchdog.onLoadRequested(URL);
        advance(5_000L);
        assert success.hints == 1 : "5s hint must fire once";
        assert "https://example.com".equals(success.lastAddress) : "diagnostics must redact path/query";
        watchdog.onPageStarted(URL);
        watchdog.onPageFinished(URL);
        advance(30_000L);
        assert success.finished == 1 : "successful load callback missing";
        assert success.retries == 0 : "stale retry fired after page finish";
        assert success.failures == 0 : "stale failure fired after page finish";
        assert success.hints == 1 : "stale hint fired after page finish";

        // Query/fragment-only URLs have no slash: diagnostics must still stop at origin.
        Events queryOnly = new Events();
        watchdog = create(queryOnly);
        watchdog.onLoadRequested("https://example.com?access_token=must-not-leak#session");
        assert "load-requested: https://example.com".equals(watchdog.snapshotEvents().get(0))
                : "query/fragment must be stripped even when authority has no slash";

        Events userInfo = new Events();
        watchdog = create(userInfo);
        watchdog.onLoadRequested("https://user:password@example.com?secret=must-not-leak");
        assert "load-requested: https://example.com".equals(watchdog.snapshotEvents().get(0))
                : "userinfo and query must be stripped from origin diagnostics";

        Events ipv6 = new Events();
        watchdog = create(ipv6);
        watchdog.onLoadRequested("https://[2001:db8::1]:8443?token=must-not-leak");
        assert "load-requested: https://[2001:db8::1]:8443".equals(watchdog.snapshotEvents().get(0))
                : "IPv6 authority and port must be retained while query is stripped";

        // A main-frame error also clears all pending stage callbacks.
        Events error = new Events();
        watchdog = create(error);
        watchdog.onLoadRequested(URL);
        watchdog.onReceivedError(URL, -2, "connection failed");
        advance(30_000L);
        assert error.errors == 1 : "load error callback missing";
        assert error.retries == 0 && error.failures == 0 && error.hints == 0
                : "watchdog stage fired after load error";

        // Explicit teardown/cancel must be terminal for the pending navigation.
        Events cancelled = new Events();
        watchdog = create(cancelled);
        watchdog.onLoadRequested(URL);
        watchdog.cancel();
        advance(30_000L);
        assert cancelled.hints == 0 && cancelled.retries == 0 && cancelled.failures == 0
                : "watchdog callback fired after cancel";

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
        advance(9_000L);
        assert lifecycle.failures == 1 : "fail stage must resume at the original elapsed deadline";

        System.out.println("PASS BrowserLoadWatchdogSmoke: terminal cancellation, error, cancel, pause/resume");
    }
}
