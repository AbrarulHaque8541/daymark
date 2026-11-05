#!/usr/bin/env python3
"""Source guard for browser HTTP policy and app-owned HTTPS transport boundaries."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1]).resolve()
main = root / "app/src/main"
java = main / "java/com/abrar/daymark"
android = "{http://schemas.android.com/apk/res/android}"

manifest = ET.parse(main / "AndroidManifest.xml").getroot()
application = manifest.find("application")
assert application is not None
assert application.get(android + "usesCleartextTraffic") == "false", \
    "runtime HTTP must remain blocked until the Activity DownloadManager path is safely replaced or constrained"
for flavor in ("play", "githubSideload"):
    flavor_manifest = ET.parse(root / f"app/src/{flavor}/AndroidManifest.xml").getroot()
    flavor_app = flavor_manifest.find("application")
    assert flavor_app is not None
    assert flavor_app.get(android + "usesCleartextTraffic") is None, \
        f"{flavor} must inherit the shared browser network policy without an override"

policy = (java / "BrowserHttpPolicy.java").read_text(encoding="utf-8")
for marker in ("ALLOW_HTTP = true", "securityLabel(String committedUrl)",
               'return "Not encrypted"', 'return "Encrypted"',
               "shouldBlockTopLevelRedirect(", "hasWebSchemeAndHost("):
    assert marker in policy, f"browser HTTP policy missing {marker}"

webview = (java / "DaymarkWebView.java").read_text(encoding="utf-8")
for marker in ("WebSettings.MIXED_CONTENT_NEVER_ALLOW",
               "BrowserHttpPolicy.shouldBlockTopLevelRedirect(",
               "onReceivedSslError(WebView view, SslErrorHandler handler, SslError error)",
               "handler.cancel();"):
    assert marker in webview, f"WebView security boundary missing {marker}"
assert "handler.proceed()" not in webview, "WebView TLS errors must remain fail-closed"

client_path = java / "BrowserHttpsDownloader.java"
client = client_path.read_text(encoding="utf-8")
for marker in ("HttpsURLConnection", "MAX_REDIRECTS = 5",
               "connection.setInstanceFollowRedirects(false)", "validateHttpsUrl(",
               "resolveRedirect(", "sameOrigin(", "stripAllCallerHeaders(headers)",
               "headers.clear();",
               "requireOnline(onlineGate)", "connection.setUseCaches(false)"):
    assert marker in client, f"browser HTTPS downloader missing security contract: {marker}"
for forbidden in ("setInstanceFollowRedirects(true)", "TrustManager", "HostnameVerifier",
                  "setSSLSocketFactory(", "CookieHandler", "Log."):
    assert forbidden not in client, f"browser HTTPS downloader must not use {forbidden}"
assert "import android.app.DownloadManager" not in client and "new DownloadManager(" not in client, \
    "browser downloader must use app-owned HTTPS requests, not platform DownloadManager"

# Keep native clients independently HTTPS-only; the WebView's app-wide HTTP opt-in stays disabled.
issues = (java / "GitHubPublicIssuesClient.java").read_text(encoding="utf-8")
webhook = (java / "TaskWebhookClient.java").read_text(encoding="utf-8")
release = (java / "updater/GitHubReleaseClient.java").read_text(encoding="utf-8")
updater = (java / "updater/GitHubApkDownloader.java").read_text(encoding="utf-8")
for marker in ('return "https://api.github.com/repos/"',
               "connection.setInstanceFollowRedirects(false);"):
    assert marker in issues, f"public GitHub issues transport missing {marker}"
for marker in ('"https".equalsIgnoreCase(uri.getScheme())', "HttpsURLConnection",
               "connection.setInstanceFollowRedirects(false)"):
    assert marker in webhook, f"task webhook transport missing {marker}"
for marker in ('RELEASES_ENDPOINT', '"https://api.github.com/repos/AbrarulHaque8541/daymark/releases/latest"',
               "connection.setInstanceFollowRedirects(false);"):
    assert marker in release, f"updater metadata transport missing {marker}"
for marker in ("MAX_REDIRECTS = 5", "connection.setInstanceFollowRedirects(false);",
               "UpdaterCore.isAllowedAssetUrl(release.assetUrl)",
               "UpdaterCore.isAllowedAssetRedirectUrl(redirect.toExternalForm())"):
    assert marker in updater, f"APK updater transport missing {marker}"

# The legacy Activity hookup is intentionally not edited in this serialized networking lane.
# Its DownloadManager redirect behavior remains an integration blocker, not a tested guarantee.
activity = (java / "MainActivity.java").read_text(encoding="utf-8")
assert "private void queueBrowserDownload(" in activity and "new DownloadManager.Request(Uri.parse(url))" in activity
assert "new BrowserHttpsDownloader(" not in activity, \
    "do not claim browser downloads use the app-owned client before the Activity integration lane"

policy_test = (root / "tools/BrowserHttpPolicySmoke.java").read_text(encoding="utf-8")
download_test = (root / "tools/BrowserHttpsDownloaderSmoke.java").read_text(encoding="utf-8")
for marker in ("final committed HTTP page is labelled Not encrypted",
               "HTTPS-to-HTTP top-level redirect is blocked",
               "direct user-entered HTTP navigation is permitted"):
    assert marker in policy_test, f"missing browser HTTP policy regression: {marker}"
for marker in ("stripsCredentialsAfterCrossingOrigins", "rejectsUnsafeRedirectTargets",
               "capsRedirectsAtFiveHops", "honorsOnlineAndOfflineTransitions",
               "same-origin redirect", "credentials remain stripped", "X-Api-Key", "X-Auth-Token",
               "custom credential header is absent on the CDN hop",
               "custom credential header remains absent after returning to the original origin",
               "custom auth-token header is absent on the CDN hop",
               "custom auth-token header remains absent after returning to the original origin"):
    assert marker in download_test, f"missing downloader redirect/cookie/offline test: {marker}"

issues_test = (root / "tools/GitHubPublicIssuesClientSmoke.java").read_text(encoding="utf-8")
webhook_test = (root / "tools/TaskWebhookClientSmoke.java").read_text(encoding="utf-8")
updater_test = (root / "tools/GitHubTransportSmoke.java").read_text(encoding="utf-8")
for marker, source, label in (
        ("expectFailure(302", issues_test, "GitHub issue redirect rejection"),
        ("expectStatus(302", webhook_test, "webhook redirect rejection"),
        ("releaseClientRejectsRedirectAndOversizedBody", updater_test, "updater metadata redirect rejection"),
        ("downloaderFollowsOnlyValidatedRedirectsAndCopiesExactBytes", updater_test, "updater APK redirect validation"),
        ("downloaderEnforcesRedirectAndBodyBounds", updater_test, "updater APK redirect cap")):
    assert marker in source, f"missing host regression for {label}"

runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
for marker in ("BrowserHttpsDownloader.java", "BrowserHttpPolicySmoke.java",
               "BrowserHttpsDownloaderSmoke.java", "BrowserHttpsDownloaderSmoke"):
    assert marker in runner, f"canonical host suite does not include {marker}"

print("PASS browser/network security source guard; WebView HTTP runtime BLOCKED pending safe Activity downloader integration")
