#!/usr/bin/env python3
"""Source regression checks for the browser Downloads destination."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
method = activity.split("private void showBrowserDownloadsDialog()", 1)[1].split(
    "private void queueBrowserDownload(", 1
)[0]
assert "DownloadManager" in method and "manager.query(new DownloadManager.Query())" in method, \
    "the in-app list must query Android DownloadManager"
assert "BrowserDownloadListPolicy.Collector(BrowserDownloadListPolicy.MAX_VISIBLE)" in method, \
    "the in-app list must retain only a bounded newest-download window"
assert "DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP" in method, \
    "the list must use provider modification timestamps when available"
assert "collector.add(id, title, url, mime, status, reason," in method, \
    "provider rows must flow through the allocation-conscious streaming selector"
assert "BrowserDownloadListPolicy.Selection selection = collector.finish();" in method, \
    "the provider scan must finish through the bounded collector"
assert "for (BrowserDownloadListPolicy.Item item : selection.items)" in method, \
    "the UI must render the selected newest-first bounded window"
assert "Downloads (showing 100 most recent items)" in method, \
    "truncated history must disclose that the most recent items are shown"
assert "New browser downloads are temporarily blocked until Daymark can validate every redirect safely." in method, \
    "the list must explain the empty state"
assert 'setNeutralButton("Refresh"' in method, \
    "the list must expose a refresh action"
assert "DownloadManager.ACTION_VIEW_DOWNLOADS" not in method, \
    "the status list must not silently hand off to another screen"
assert "private final BrowserDownloadTracker browserDownloadTracker" in activity, \
    "the bounded in-memory tracker must be owned by the Activity"
queue = activity.split("private void queueBrowserDownload(", 1)[1].split("private void exitBrowserFullscreen", 1)[0]
assert "BrowserDownloadFailClosedPolicy.evaluate" in queue, \
    "new browser downloads must be fail-closed and must not enqueue"
assert "BrowserDownloadTracker.Entry tracked = browserDownloadTracker.get(id)" in method, \
    "the Downloads list should update only entries already owned by Daymark browser enqueue"
for expected in ("browserDownloadTracker.onQueued(id)", "browserDownloadTracker.onProgress(id, downloaded, total)", \
                 "browserDownloadTracker.onPaused(id)", "browserDownloadTracker.onComplete(id)", \
                 "browserDownloadTracker.onFailure(id, Integer.toString(reason))"):
    assert expected in method, f"provider status must update the bounded tracker: {expected}"
print("PASS browser Downloads destination: in-app DownloadManager list, explicit empty state and refresh")
