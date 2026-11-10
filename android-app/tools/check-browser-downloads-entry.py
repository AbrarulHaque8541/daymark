#!/usr/bin/env python3
"""Source regression checks for the in-app browser Downloads destination (issues #211/#213)."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
source_root = root / "app/src/main/java"
production_sources = list(source_root.rglob("*.java")) + list(source_root.rglob("*.kt"))
assert production_sources, "the production Android source tree must be present"
for source_path in production_sources:
    source_text = source_path.read_text(encoding="utf-8")
    assert "DownloadManager.Request(" not in source_text, \
        f"new Android DownloadManager requests are forbidden until redirect-safe transport exists: {source_path}"
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
assert "No Daymark browser downloads are available." in method, \
    "the list must explain the empty state"
assert "New browser downloads are temporarily blocked" in method, \
    "the empty state must disclose the fail-closed redirect-safety policy"
assert 'setNeutralButton("Refresh"' in method, \
    "the list must expose a refresh action"
assert "DownloadManager.ACTION_VIEW_DOWNLOADS" not in method, \
    "the status list must not silently hand off to another screen"
assert "private final BrowserDownloadTracker browserDownloadTracker" in activity, \
    "the bounded in-memory tracker must be owned by the Activity"
queue = activity.split("private void queueBrowserDownload(", 1)[1].split("private void exitBrowserFullscreen", 1)[0]
assert "BrowserAddress.isAllowedWebUrl(url)" in queue, \
    "the callback must still reject non-web schemes"
assert "BrowserDownloadFailClosedPolicy.evaluate(browserNetworkPolicy.allowsRemoteLoads())" in queue, \
    "the callback must respect Online/Offline state and fail closed"
assert "showToast(decision.userMessage)" in queue, \
    "the blocked download action must explain the current limitation"
for forbidden in ("new DownloadManager.Request(", "manager.enqueue(", "CookieManager.getInstance().getCookie(url)", \
                  'addRequestHeader("Cookie"'):
    assert forbidden not in queue, f"new browser downloads must not use {forbidden}"
assert "new DownloadManager.Request(" not in activity and "manager.enqueue(request)" not in activity, \
    "MainActivity must not persist new browser download URLs/headers through DownloadManager"
assert "BrowserDownloadEnqueueGate browserDownloadEnqueueGate" not in activity, \
    "the removed legacy enqueue gate must not remain in Activity"
assert "Download started for the selected media file" not in activity, \
    "media selection must not claim a download started after the callback is blocked"
assert "(tap to retry)" not in activity and 'setTitle("Retry download?")' not in activity, \
    "failed history must not promise retry while downloads are disabled"
assert "BrowserDownloadTracker.Entry tracked = browserDownloadTracker.get(id)" in method, \
    "the Downloads list may synchronize existing in-memory entries from prior enqueues; new enqueues remain blocked"
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

# Work by: ChatGPT (OpenAI)
# Model: GPT-6
# Tooling: GitHub connector via Code Mode; exact-main/#648 source comparison; fail-closed policy and source-guard integration
# Timestamp (UTC): 2026-11-10T14:11:50.811Z
