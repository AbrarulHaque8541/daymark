#!/usr/bin/env python3
"""Source regression checks for the DownloadManager-backed browser downloads view (issue #211)."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
method = activity.split("private void showBrowserDownloadsDialog()", 1)[1].split(
    "private void queueBrowserDownload(", 1
)[0]

for marker, explanation in (
    ("manager.query(new DownloadManager.Query())", "Downloads must be queried from the system provider"),
    ("DownloadManager.COLUMN_STATUS", "the list must read provider status"),
    ("DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR", "progress must use provider byte counts"),
    ("DownloadManager.COLUMN_TOTAL_SIZE_BYTES", "progress must account for known total size"),
    ("DownloadManager.STATUS_PENDING", "queued downloads need a visible status"),
    ("DownloadManager.STATUS_RUNNING", "running downloads need a visible status"),
    ("DownloadManager.STATUS_PAUSED", "paused downloads need a visible status"),
    ("DownloadManager.STATUS_SUCCESSFUL", "completed downloads need an open action"),
    ("DownloadManager.STATUS_FAILED", "failed downloads need an honest state"),
    ("manager.getUriForDownloadedFile(id)", "completed files must use the provider content URI"),
    ("Intent.FLAG_GRANT_READ_URI_PERMISSION", "file handoff must grant read-only access"),
    ("Intent.ACTION_VIEW", "completed files should open only after a user tap"),
    ("BrowserAddress.isAllowedWebUrl(url)", "retry must validate HTTPS before making a new request"),
    ('setPositiveButton("Retry"', "retry must require explicit user confirmation"),
    ("android.webkit.WebSettings.getDefaultUserAgent(this)", "retry must not inherit an unrelated tab's user agent"),
    ('setNeutralButton("Refresh"', "the list must offer refresh"),
):
    assert marker in method, explanation

assert "showBrowserDownloadsDialog();" in activity, "the overflow Downloads action must open the download list"
selection = activity.split("private void handleBrowserDownloadSelection", 1)[1].split(
    "private boolean isBrowserDownloadActive", 1
)[0]
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
normalized_activity = "".join(activity.split())
assert (
    "BrowserDownloadFilenamePolicy.sanitize(URLUtil.guessFileName(url,contentDisposition,mimeType))"
    in normalized_activity
), "download names derived from untrusted URL/Content-Disposition must be sanitized before use"
assert "openDownloadsFolder()" not in activity, "Downloads must not be a generic document picker"
assert "ACTION_OPEN_DOCUMENT" not in method, "the downloads list must not be implemented as a generic file picker"
assert "No Daymark browser downloads are available yet." in method, "empty state must be explicit"
assert "No compatible app could open this file." in method, "viewer handoff failure must be disclosed"
print("PASS browser downloads source checks: status/progress, confirmed HTTPS retry, safe file handoff, refresh and empty/error states")

# Work by: ChatGPT
# Model: GPT-6
# Tooling: GitHub MCP tools
# Timestamp (UTC): 2026-11-01T07:28:39Z
