#!/usr/bin/env python3
"""Static guards for the current HTTPS-only app clients and cleartext manifest setting.

These source assertions do not prove Android WebView HTTP behavior. WebView honors the current
manifest's cleartext restriction for this target SDK; see docs/BROWSER_HTTP_POLICY_AUDIT.md.
"""
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
base = root / "app/src/main/java/com/abrar/daymark"
updater = base / "updater"

# The release endpoint and each updater URL boundary must require HTTPS independently.
release_client = (updater / "GitHubReleaseClient.java").read_text(encoding="utf-8")
m = re.search(r'RELEASES_ENDPOINT\s*=\s*"([^"]+)"', release_client)
assert m and m.group(1).startswith("https://"), "Updater release endpoint must be HTTPS"
assert "connection.setInstanceFollowRedirects(false);" in release_client, \
    "Release metadata redirects must not be followed automatically"

core = (updater / "UpdaterCore.java").read_text(encoding="utf-8")
asset = core.split("public static boolean isAllowedAssetUrl(", 1)[1].split("\n    }", 1)[0]
redirect = core.split("public static boolean isAllowedAssetRedirectUrl(", 1)[1].split("\n    }", 1)[0]
assert '"https".equalsIgnoreCase(uri.getScheme())' in asset, "Asset URL must require HTTPS"
assert '"https".equalsIgnoreCase(uri.getScheme())' in redirect, "Asset redirects must require HTTPS"
downloader = (updater / "GitHubApkDownloader.java").read_text(encoding="utf-8")
for marker in ("UpdaterCore.isAllowedAssetUrl(release.assetUrl)",
               "connection.setInstanceFollowRedirects(false);",
               "UpdaterCore.isAllowedAssetRedirectUrl(redirect.toExternalForm())"):
    assert marker in downloader, f"Updater downloader boundary missing: {marker}"

# Recognize comments and Java quoted literals in one pass. Stripping // comments first also
# strips the // inside "http://...", which silently hid insecure literals from the old guard.
tokens = re.compile(r'''/\*.*?\*/|//[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*' ''',
                    re.DOTALL | re.VERBOSE)
for path in sorted(updater.glob("*.java")):
    text = path.read_text(encoding="utf-8")
    literals = [match.group(0) for match in tokens.finditer(text)
                if match.group(0).startswith('"')]
    assert not any("http://" in literal.lower() for literal in literals), \
        f"{path.name} contains an HTTP URL string literal"

# Other current app-owned clients have fixed HTTPS endpoints or validate the user endpoint,
# and do not automatically follow redirects. These are source checks, not exhaustive proofs.
issues = (base / "GitHubPublicIssuesClient.java").read_text(encoding="utf-8")
assert 'return "https://api.github.com/repos/"' in issues, "Public issues endpoint must be HTTPS"
assert "connection.setInstanceFollowRedirects(false);" in issues, "Public issues redirects must be disabled"
webhook = (base / "TaskWebhookClient.java").read_text(encoding="utf-8")
for marker in ('"https".equalsIgnoreCase(uri.getScheme())', "url = validateEndpoint(endpoint);",
               "HttpsURLConnection", "connection.setInstanceFollowRedirects(false);"):
    assert marker in webhook, f"Webhook HTTPS boundary missing: {marker}"

# Preserve the existing app-wide platform defense. It also affects WebView; do not assert
# that HTTP browsing works until a reviewed policy change and runtime tests establish it.
manifest = ET.parse(root / "app/src/main/AndroidManifest.xml").getroot()
application = manifest.find("application")
assert application is not None
android = "{http://schemas.android.com/apk/res/android}"
assert application.get(android + "usesCleartextTraffic") == "false", \
    "Main manifest must keep usesCleartextTraffic=false pending security review"

http_policy = (base / "BrowserHttpPolicy.java").read_text(encoding="utf-8")
assert "ALLOW_HTTP = true" in http_policy, "Browser address policy should accept HTTP"
assert '"Not encrypted"' in http_policy, "The intended HTTP label must remain defined"

print("PASS HTTPS client and manifest source guards; HTTP WebView runtime/label NOT TESTED")
