#!/usr/bin/env python3
"""Source guard for BrowserHttpPolicy, BrowserAddress, and BrowserDownloadTracker."""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
base = root / "app/src/main/java/com/abrar/daymark"

http = base / "BrowserHttpPolicy.java"
assert http.exists(), "BrowserHttpPolicy.java missing"
s = http.read_text(encoding="utf-8")
assert "ALLOW_HTTP = true" in s, "HTTP must be explicitly allowed"
assert "isHttp(" in s and "isHttps(" in s, "scheme detection missing"
assert "securityLabel(" in s, "user-facing security label missing"
assert '"Not encrypted"' in s, "HTTP must show 'Not encrypted' label"
assert "resolveBareDomain(" in s, "bare-domain to HTTPS resolution missing"
assert "isAllowedWebScheme(" in s, "scheme allowlist missing"

# The helper alone is not enough: require a persistent page marker separate from
# the transient status line that fades after a short delay.
activity = base / "MainActivity.java"
assert activity.exists(), "MainActivity.java missing"
main = activity.read_text(encoding="utf-8")
page_finished_marker = "@Override public void onPageFinished(String url)"
page_started_marker = "@Override public void onPageStarted(String url)"
navigation_blocked_marker = "@Override public void onNavigationBlocked(String url)"
assert page_finished_marker in main, "WebView page-finished callback missing"
assert page_started_marker in main, "WebView page-started callback missing"
assert navigation_blocked_marker in main, "WebView navigation callback boundary missing"
security_marker = re.search(r"private void updateBrowserSecurityMarker\(String url\)\s*\{(.*?)\n    \}", main, re.S)
assert security_marker, "persistent browser security marker updater missing"
assert "BrowserHttpPolicy.isHttp(url)" in security_marker.group(1), "persistent marker must classify active HTTP pages"
assert "BrowserHttpPolicy.securityLabel(url)" in security_marker.group(1), "persistent marker must use the HTTP security label"
assert "browserSecurityMarker.setVisibility(pageNotEncrypted ? View.VISIBLE : View.GONE)" in security_marker.group(1), \
    "persistent marker must remain visible for HTTP and clear for non-HTTP pages"
assert "panel.addView(browserSecurityMarker" in main and "browserSecurityMarker.setAccessibilityLiveRegion" in main, \
    "persistent security marker must be visible and accessible in the browser UI"
page_started = main.split(page_started_marker, 1)[1].split(page_finished_marker, 1)[0]
assert "updateBrowserSecurityMarker(url)" in page_started, "new active page must immediately refresh its persistent marker"
page_finished = main.split(page_finished_marker, 1)[1].split(navigation_blocked_marker, 1)[0]
assert "updateBrowserSecurityMarker(url)" in page_finished, "finished active page must refresh its persistent marker"
assert "Not encrypted: this HTTP page has no transport security." in page_finished, \
    "successful HTTP page loads must show the visible Not encrypted warning"
assert "showBrowserStatus(" in page_finished, "HTTP security label must reach the browser status UI"
status_helper = re.search(r"private void showBrowserStatus\(String message\)\s*\{(.*?)\n    \}", main, re.S)
assert status_helper and "browserStatusHideRunnable" in status_helper.group(1), "transient status auto-hide behavior must remain"
assert "browserSecurityMarker" not in status_helper.group(1), \
    "transient status changes and hide animations must not hide or mutate the persistent security marker"
hide_runnable = status_helper.group(1).split("browserStatusHideRunnable = () -> {", 1)[1].split("};", 1)[0]
assert "browserStatus.setVisibility(View.GONE)" in hide_runnable and "browserSecurityMarker" not in hide_runnable, \
    "auto-hide must affect only transient status, never the HTTP page marker"
switch_tab = re.search(r"private void switchBrowserTab\(DaymarkWebView tab\)\s*\{(.*?)\n    \}", main, re.S)
assert switch_tab and "updateBrowserSecurityMarker(tab.getUrl())" in switch_tab.group(1), \
    "switching active tabs must recompute the persistent HTTP label"

addr = base / "BrowserAddress.java"
assert addr.exists(), "BrowserAddress.java missing"
a = addr.read_text(encoding="utf-8")
assert "BrowserHttpPolicy.isAllowedWebScheme(" in a, "BrowserAddress must delegate scheme check to BrowserHttpPolicy.isAllowedWebScheme()"
assert "Only HTTP and HTTPS pages are supported" in a, "BrowserAddress must accept HTTP+HTTPS, reject other schemes"

hist = base / "BrowserHistory.java"
assert hist.exists(), "BrowserHistory.java missing"
h = hist.read_text(encoding="utf-8")
assert '"http".equalsIgnoreCase(scheme)' in h, "BrowserHistory must accept HTTP origins"
assert "HTTP/HTTPS" in h, "BrowserHistory must document HTTP/HTTPS origin storage"

dl = base / "BrowserDownloadTracker.java"
assert dl.exists(), "BrowserDownloadTracker.java missing"
d = dl.read_text(encoding="utf-8")
assert "MAX_TRACKED = 20" in d, "bounded tracker (max 20) missing"
assert "enum Status" in d, "download status enum missing"
assert "QUEUED" in d and "IN_PROGRESS" in d and "COMPLETED" in d and "FAILED" in d and "CANCELLED" in d, "all statuses missing"
assert "redact(" in d, "URL redaction missing (privacy)"
assert "synchronized" in d, "thread safety missing"
assert "progress()" in d, "progress calculation missing"
assert 'Log.i(TAG, "download-started id=" + id + " url=" + e.url + " file=" + e.fileName)' not in d, "download filenames must never be written to Logcat"
assert 'Log.i(TAG, "download-completed id=" + id + " file=" + e.fileName' not in d, "download completion logs must not expose filenames"

# Run the tracker regression on the same host JDK used by the other policy smokes.
# This catches privacy regressions that source-only checks cannot detect.
subprocess.run(["sh", str(root / "tools/run-browser-download-tracker-tests.sh")], check=True)

print("PASS browser address-policy/history/download source guards; HTTP WebView runtime and UI labeling NOT TESTED")
