#!/usr/bin/env python3
"""Source regression checks for the DownloadManager-backed browser downloads view (issue #211)."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")

method = activity.split("private void showBrowserDownloadsDialog()", 1)[1].split("private void handleBrowserDownloadSelection", 1)[0]
for marker, explanation in (
    ("DownloadManager.COLUMN_STATUS", "the list must read provider status"),
    ("DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR", "the list must read downloaded bytes"),
    ("DownloadManager.COLUMN_TOTAL_SIZE_BYTES", "the list must read total bytes"),
    ("BrowserDownloadProgress.percent(downloaded, total)", "progress must use the overflow-safe helper"),
    ("manager.getUriForDownloadedFile(id)", "completed files must use the provider content URI"),
    ("Intent.FLAG_GRANT_READ_URI_PERMISSION", "file handoff must grant read-only access"),
    ("Intent.ACTION_VIEW", "completed files should open only after a user tap"),
    ("BrowserDownloadFailClosedPolicy.evaluate(browserNetworkPolicy.allowsRemoteLoads())", "failed downloads must respect Online/Offline state and remain blocked"),
    ("showToast(decision.userMessage)", "failed downloads must explain that retry is unavailable"),
    ('setNeutralButton("Refresh"', "the list must offer refresh"),
):
    assert marker in method, explanation

selection = activity.split("private void handleBrowserDownloadSelection", 1)[1].split(
    "private boolean isBrowserDownloadActive", 1
)[0]
assert "(retry unavailable)" in activity, "failed history rows must not promise an unsafe retry"
assert 'setTitle("Retry download?")' not in selection, "failed rows must not offer a retry that always fails closed"
assert "queueBrowserDownload(" not in selection, "failed history rows must not start a network request"
for marker, explanation in (
    ("DownloadManager.STATUS_PENDING", "queued downloads must expose cancellation"),
    ("DownloadManager.STATUS_RUNNING", "running downloads must expose cancellation"),
    ("DownloadManager.STATUS_PAUSED", "paused downloads must expose cancellation"),
):
    assert marker in selection, explanation

active_check = activity.split("private boolean isBrowserDownloadActive", 1)[1].split(
    "private void queueBrowserDownload", 1
)[0]
provider_error_catch = active_check.index("catch (RuntimeException providerUnavailable)")
assert "return false;" in active_check[provider_error_catch:provider_error_catch + 120], \
    "provider/query errors must fail closed without removing a file"
assert "openDownloadsFolder()" not in activity, "Downloads must not be a generic document picker"
assert "ACTION_OPEN_DOCUMENT" not in method, "the downloads list must not be implemented as a generic file picker"
assert "No Daymark browser downloads are available." in method, "empty state must be explicit"
assert "No compatible app could open this file." in method, "viewer handoff failure must be disclosed"
assert "New browser downloads are temporarily blocked" in method, \
    "empty state must explain that new downloads are deliberately fail-closed"
print("PASS browser downloads history checks: status/progress, fail-closed retry refusal, safe existing-file handoff, refresh and empty/error states")

# Work by: ChatGPT
# Model: GPT-6
