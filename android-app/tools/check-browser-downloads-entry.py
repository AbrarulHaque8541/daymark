#!/usr/bin/env python3
"""Source regression checks for the in-app browser Downloads destination (issues #211/#213)."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
menu = activity.split("private void showBrowserOverflowMenu", 1)[1].split(
    "private void importExtensionFromUri", 1
)[0]
method = activity.split("private void showBrowserDownloadsDialog()", 1)[1].split(
    "private String browserDownloadStatusLabel", 1
)[0]

assert 'showBrowserDownloadsDialog();' in menu, \
    "the browser Downloads menu must open the in-app status list"
assert "private void openDownloadsFolder()" not in activity, \
    "the obsolete generic/system downloads destination must not shadow the in-app list"
assert "manager.query(new DownloadManager.Query())" in method, \
    "the in-app list must query Android DownloadManager"
assert "BrowserDownloadListPolicy.Collector(BrowserDownloadListPolicy.MAX_VISIBLE)" in method, \\
    "the in-app list must retain only a bounded newest-download window"
assert "DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP" in method, \\
    "the list must use provider modification timestamps when available"
assert "collector.add(new BrowserDownloadListPolicy.Item" in method, \\
    "provider rows must flow through the streaming bounded selector"
assert "for (BrowserDownloadListPolicy.Item item : selection.items)" in method, \\
    "the UI must render the selected newest-first bounded window"
assert "Downloads (showing 100 most recent items)" in method, \\
    "truncated history must disclose that the most recent items are shown"
assert "No Daymark browser downloads are available yet." in method, \
    "the list must explain the empty state"
assert 'setNeutralButton("Refresh"' in method, \
    "the list must expose a refresh action"
assert "DownloadManager.ACTION_VIEW_DOWNLOADS" not in method, \
    "the status list must not silently hand off to another screen"
assert "private final BrowserDownloadTracker browserDownloadTracker" in activity, \
    "the bounded in-memory tracker must be owned by the Activity"
queue = activity.split("private void queueBrowserDownload(", 1)[1].split("private void exitBrowserFullscreen", 1)[0]
assert "long downloadId = manager.enqueue(request);" in queue and \
    "browserDownloadTracker.start(downloadId, url, filename)" in queue, \
    "only successfully enqueued Daymark browser downloads should enter the tracker"
assert "BrowserDownloadTracker.Entry tracked = browserDownloadTracker.get(id)" in method, \
    "the Downloads list should update only entries already owned by Daymark browser enqueue"
for expected in ("browserDownloadTracker.onQueued(id)", "browserDownloadTracker.onProgress(id, downloaded, total)", \
                 "browserDownloadTracker.onPaused(id)", "browserDownloadTracker.onComplete(id)", \
                 "browserDownloadTracker.onFailure(id, Integer.toString(reason))"):
    assert expected in method, f"provider status must update the bounded tracker: {expected}"
handler = activity.split("private void handleBrowserDownloadSelection(", 1)[1].split( \
    "private boolean isBrowserDownloadActive", 1
)[0]
assert "browserDownloadTracker.onCancel(id)" in handler, \
    "confirmed DownloadManager removal must be reflected in the tracker"
print("PASS browser Downloads destination: in-app DownloadManager list, explicit empty state and refresh")

# Work by: ChatGPT
# Model: GPT-6
# Tooling: GitHub MCP tools
# Timestamp (UTC): 2026-10-09T17:44:30Z
