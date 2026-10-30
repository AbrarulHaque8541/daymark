#!/usr/bin/env python3
"""Source guard: updater and all non-browser network clients must remain HTTPS-only,
even though the embedded browser now allows HTTP (BrowserHttpPolicy.ALLOW_HTTP).
This is the #348 P0 checkbox: "Ensure browser-only cleartext support does not weaken
updater or other app network clients."
"""
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
base = root / "app/src/main/java/com/abrar/daymark"
updater = base / "updater"

# 1. Updater release endpoint must be HTTPS
release_client = (updater / "GitHubReleaseClient.java").read_text(encoding="utf-8")
assert 'RELEASES_ENDPOINT =' in release_client, "RELEASES_ENDPOINT missing"
m = re.search(r'RELEASES_ENDPOINT\s*=\s*"([^"]+)"', release_client)
assert m, "RELEASES_ENDPOINT value not found"
assert m.group(1).startswith("https://"), f"Updater endpoint must be HTTPS, got {m.group(1)}"

# 2. UpdaterCore.isAllowedAssetUrl must require https scheme
core = (updater / "UpdaterCore.java").read_text(encoding="utf-8")
assert '"https".equalsIgnoreCase(uri.getScheme())' in core, "isAllowedAssetUrl must require https scheme"
assert 'isAllowedAssetRedirectUrl' in core, "isAllowedAssetRedirectUrl missing"
assert core.count('"https".equalsIgnoreCase') >= 2, "Both isAllowedAssetUrl and isAllowedAssetRedirectUrl must enforce https"

# 3. No http:// string literals in updater package (except in comments)
for f in sorted(updater.glob("*.java")):
    text = f.read_text(encoding="utf-8")
    # Strip comments before checking for http:// literals
    no_comments = re.sub(r"//.*", "", text)
    no_comments = re.sub(r"/\*.*?\*/", "", no_comments, flags=re.DOTALL)
    http_literals = re.findall(r'"http://[^"]*"', no_comments)
    assert not http_literals, f"{f.name} contains http:// string literal: {http_literals}"

# 4. Android manifest must keep usesCleartextTraffic=false (blocks app-level cleartext;
#    WebView handles its own network stack, so HTTP browsing still works in-browser)
manifest = (root / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
assert 'usesCleartextTraffic="false"' in manifest, "Main manifest must keep usesCleartextTraffic=false"

# 5. BrowserHttpPolicy must allow HTTP (browser) while updater stays HTTPS-only (separate path)
http_policy = (base / "BrowserHttpPolicy.java").read_text(encoding="utf-8")
assert "ALLOW_HTTP = true" in http_policy, "Browser allows HTTP"
assert '"Not encrypted"' in http_policy, "HTTP pages must be labeled Not encrypted"

print("PASS check-updater-https-only: updater endpoint, asset URLs, redirect URLs, manifest cleartext, and browser HTTP policy all verified")
