#!/usr/bin/env python3
"""Source guard for BrowserHttpPolicy, BrowserAddress, and BrowserDownloadTracker."""
import pathlib
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

# Run the tracker regression on the same host JDK used by the other policy smokes.
# This catches privacy regressions that source-only checks cannot detect.
subprocess.run(["sh", str(root / "tools/run-browser-download-tracker-tests.sh")], check=True)

print("PASS browser address-policy/history/download source guards; HTTP WebView runtime and UI labeling NOT TESTED")
