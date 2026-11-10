#!/usr/bin/env python3
"""Source regression checks for the DownloadManager-backed browser downloads view (issue #211)."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
method = activity.split("private void showBrowserDownloadsDialog()", 1)[1].split(
    "private void queueBrowserDownload(", 1
)[0]
queue = activity.split("private void queueBrowserDownload(", 1)[1].split(
    "private void exitBrowserFullscreen", 1
)[0]
assert "BrowserAddress.isAllowedWebUrl(url)" in queue, \
    "the callback must still reject non-web schemes"
assert "BrowserDownloadFailClosedPolicy.evaluate(browserNetworkPolicy.allowsRemoteLoads())" in queue, \
    "new browser downloads must fail closed in both Online and Offline modes"
assert "showToast(decision.userMessage)" in queue, \
    "the blocked download action must explain its current limitation"
for forbidden in ("new DownloadManager.Request(", "manager.enqueue(", "CookieManager.getInstance().getCookie(url)", \
                  'addRequestHeader("Cookie"'):
    assert forbidden not in queue, f"new browser downloads must not reach DownloadManager: {forbidden}"
assert "new DownloadManager.Request(" not in activity and "manager.enqueue(request)" not in activity, \
    "MainActivity must not persist new browser download URLs/headers through DownloadManager"
assert "BrowserDownloadEnqueueGate browserDownloadEnqueueGate" not in activity, \
    "the removed legacy enqueue gate must not remain wired into Activity"
assert "Download started for the selected media file" not in activity, \
    "media selection must not claim a download started after the callback is blocked"

for marker, explanation in (
    ("manager.query(new DownloadManager.Query())", "Downloads must be queried from the system provider"),
    ("DownloadManager.COLUMN_STATUS", "the list must read provider status"),
    ("DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR", "progress must use provider byte counts"),
    ("DownloadManager.COLUMN_TOTAL_SIZE_BYTES", "progress must account for known total size"),
    ("BrowserDownloadProgress.percent(downloaded, total)", "download progress percentage must avoid signed-long multiplication overflow"),
    ("DownloadManager.STATUS_PENDING", "queued downloads need a visible status"),
    ("DownloadManager.STATUS_RUNNING", "running downloads need a visible status"),
    ("DownloadManager.STATUS_PAUSED", "paused downloads need a visible status"),
    ("DownloadManager.STATUS_SUCCESSFUL", "completed downloads need an open action"),
    ("DownloadManager.STATUS_FAILED", "failed downloads need an honest state"),
    ("manager.getUriForDownloadedFile(id)", "completed files must use the provider content URI"),
    ("Intent.FLAG_GRANT_READ_URI_PERMISSION", "file handoff must grant read-only access"),
    ("Intent.ACTION_VIEW", "completed files should open only after a user tap"),
    ('setNeutralButton("Refresh"', "the list must offer refresh"),
):
    assert marker in method, explanation

assert "showBrowserDownloadsDialog();" in activity, "the overflow Downloads action must open the download list"
selection = activity.split("private void handleBrowserDownloadSelection", 1)[1].split(
    "private boolean isBrowserDownloadActive", 1
)[0]
assert "(retry unavailable)" in activity, "failed history rows must not promise a retry"
assert 'setTitle("Retry download?")' not in selection, "failed rows must not offer a retry that always fails closed"
assert "queueBrowserDownload(" not in selection, "failed history rows must not start a new network request"
for marker, explanation in (
    ("DownloadManager.STATUS_PENDING", "queued downloads must expose cancellation"),
    ("DownloadManager.STATUS_RUNNING", "running downloads must expose cancellation"),
    ("DownloadManager.STATUS_PAUSED", "paused downloads must expose cancellation"),
    ('setTitle("Cancel download?")', "cancellation must be explicitly confirmed"),
    ('setNegativeButton("Keep download"', "cancellation must offer a non-destructive escape"),
    ('setPositiveButton("Cancel download"', "only an explicit positive action may cancel"),
    ("manager.remove(id)", "cancellation must remove the provider entry and partial file"),
    ("isBrowserDownloadActive(manager, id)", "a stale row must be rechecked before deletion"),
):
    assert marker in selection, explanation
assert (
    selection.index('setPositiveButton("Cancel download"')
    < selection.index("manager.remove(id)")
), "DownloadManager.remove must occur only inside the confirmed callback"
assert (
    'Download status unavailable. Refresh to check again.' in selection
), "unknown provider states must not be mislabeled as paused"
assert (
    "the completed file will also be deleted" in selection
), "the UI must disclose DownloadManager.remove's completed-file deletion race"
for marker, explanation in (
    ("This cannot be undone.", "the cancel dialog must disclose irreversibility"),
    ("Download cancelled and removed.", "successful removal must be reported"),
    ("Download could not be cancelled. Refresh to check its status.", "provider removal failure must be reported honestly"),
    ("if (removed > 0)", "the success message must depend on the provider's removal result"),
):
    assert marker in selection, explanation
active_check = activity.split("private boolean isBrowserDownloadActive", 1)[1].split(
    "private void queueBrowserDownload", 1
)[0]
assert (
    "new DownloadManager.Query().setFilterById(id)" in active_check
), "cancellation must re-query the exact download rather than trust stale list state"
assert (
    "DownloadManager.STATUS_SUCCESSFUL" not in active_check
), "a completed file must never be offered for cancellation/removal"
for marker, explanation in (
    ("currentStatus == DownloadManager.STATUS_PENDING", "pending state must remain cancelable"),
    ("currentStatus == DownloadManager.STATUS_RUNNING", "running state must remain cancelable"),
    ("currentStatus == DownloadManager.STATUS_PAUSED", "paused state must remain cancelable"),
    ("catch (RuntimeException providerUnavailable)", "provider/query errors must fail closed without removing a file"),
):
    assert marker in active_check, explanation
provider_error_catch = active_check.index("catch (RuntimeException providerUnavailable)")
assert "return false;" in active_check[provider_error_catch:provider_error_catch + 120], \
    "provider/query errors must fail closed without removing a file"
assert "openDownloadsFolder()" not in activity, "Downloads must not be a generic document picker"
assert "ACTION_OPEN_DOCUMENT" not in method, "the downloads list must not be implemented as a generic file picker"
assert "No Daymark browser downloads are available." in method, "empty state must be explicit"
assert "Downloads are temporarily unavailable until Daymark can validate every redirect safely." in activity, \
    "the media discovery dialog must disclose that download actions are currently blocked"
assert "New browser downloads are temporarily blocked" in method, "empty state must disclose the fail-closed policy"
assert "No compatible app could open this file." in method, "viewer handoff failure must be disclosed"
print("PASS browser downloads source checks: bounded history, safe completed-file handoff/cancel, fail-closed new requests, refresh and truthful empty/error states")

# Work by: ChatGPT (OpenAI)
# Model: GPT-6
# Tooling: GitHub connector via Code Mode; exact-main/#648 source comparison; fail-closed policy and source-guard integration
# Timestamp (UTC): 2026-11-10T14:11:50.811Z
