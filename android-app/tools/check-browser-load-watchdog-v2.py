#!/usr/bin/env python3
"""Source guard for BrowserLoadWatchdog v2.

Verifies the watchdog file exists and contains the staged timeout contract,
bounded event buffer, URL redaction, and lifecycle gating.
"""
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

print("PASS check-browser-load-watchdog-v2: staged watchdog contract verified")
