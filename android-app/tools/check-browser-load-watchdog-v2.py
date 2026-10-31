#!/usr/bin/env python3
"""Source guard for BrowserLoadWatchdog v2 cancellation and timing correctness."""
import pathlib
import sys

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
wd = root / "app/src/main/java/com/abrar/daymark/BrowserLoadWatchdog.java"
assert wd.exists(), f"BrowserLoadWatchdog.java not found at {wd}"
src = wd.read_text(encoding="utf-8")

assert "STAGE_HINT_MS = 5_000L" in src, "5s hint stage missing"
assert "STAGE_RETRY_MS = 15_000L" in src, "15s retry stage missing"
assert "STAGE_FAIL_MS = 25_000L" in src, "25s fail stage missing"
assert "MAX_EVENTS = 50" in src, "bounded event buffer (max 50) missing"
assert "void onLoadRequested" in src, "onLoadRequested entry point missing"
assert "void onPageStarted" in src, "onPageStarted hook missing"
assert "void onPageFinished" in src, "onPageFinished hook missing"
assert "void onReceivedError" in src, "onReceivedError hook missing"
assert "void onRendererGone" in src, "onRendererGone hook missing"
assert "void pause()" in src and "void resume()" in src, "lifecycle gating (pause/resume) missing"
assert "redact(" in src, "URL redaction missing"
assert "BrowserSelfHealingPolicy" in src, "must integrate with BrowserSelfHealingPolicy budget"
assert "synchronized" in src, "thread safety (synchronized) missing"
assert "ArrayDeque" in src, "bounded ring buffer (ArrayDeque) missing"

# Handler.removeCallbacks removes by Runnable identity, not method-reference equivalence.
for name, callback in (("hint", "fireHint"), ("retry", "fireRetry"), ("fail", "fireFail")):
    field = f"private final Runnable {name}Runnable = this::{callback};"
    assert field in src, f"stable {name} callback instance missing"
    assert f"handler.postDelayed({name}Runnable," in src, f"{name} must schedule its stable Runnable"
    assert f"handler.removeCallbacks({name}Runnable);" in src, f"{name} must cancel its stable Runnable"
assert "handler.removeCallbacks(this::fire" not in src, "fresh method references cannot reliably cancel Handler callbacks"

# Deadlines must be based on monotonic time, not a wall clock that can jump.
assert "SystemClock.elapsedRealtime()" in src, "watchdog must use monotonic elapsed time"
assert "System.currentTimeMillis()" not in src, "wall-clock deadline is vulnerable to clock changes"

# Terminal navigation callbacks must invalidate queued stages even if a callback races removal.
for method, marker in (("onPageFinished(String url)", "page-finished:"),
                       ("onReceivedError(String url, int errorCode, String description)", "load-error:"),
                       ("onRendererGone(String url)", "renderer-gone:")):
    start = src.find(method)
    assert start >= 0, f"{method} missing"
    body_start = src.find("{", start)
    next_method = src.find("\n    /**", body_start)
    body = src[body_start:next_method if next_method >= 0 else len(src)]
    assert "cancelStages();" in body, f"{method} must cancel stages"
    assert "pendingAddress = null;" in body, f"{method} must invalidate queued callbacks"

smoke = root / "tools/BrowserLoadWatchdogSmoke.java"
assert smoke.exists(), "deterministic watchdog regression test missing"
runner = root / "tools/run-load-watchdog-tests.sh"
assert runner.exists(), "watchdog test runner missing"

print("PASS check-browser-load-watchdog-v2: stable callback identity, monotonic deadlines, terminal invalidation")
