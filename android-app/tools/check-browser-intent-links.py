#!/usr/bin/env python3
"""Source guard for safe Android intent:// links in the embedded browser."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserIntentLinkPolicy.java").read_text(encoding="utf-8")
uri_policy = (root / "app/src/main/java/com/abrar/daymark/BrowserUriRoutingPolicy.java").read_text(encoding="utf-8")
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
handoff = (root / "app/src/main/java/com/abrar/daymark/BrowserUriHandoff.java").read_text(encoding="utf-8")
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
test = root / "tools/BrowserIntentLinkPolicySmoke.java"
typed_test = (root / "tools/BrowserAddressSmoke.java").read_text(encoding="utf-8")
callback_test = (root / "tools/BrowserExternalLinkPolicySmoke.java").read_text(encoding="utf-8")
contract = (root.parent / "contracts/intent-uri-validation.tsv").read_text(encoding="utf-8")

for token in ('value.startsWith("intent://")', '"#Intent;"', 'value.endsWith(";end")',
              '"scheme".equals(key)', '"package".equals(key)',
              '"action".equals(key)', '"category".equals(key)',
              '"S.browser_fallback_url".equals(key)', 'values.containsKey(key)',
              'targetUri.getRawUserInfo() != null',
              'BrowserAddress.requireAllowedWebUrl(fallback)',
              'decodeIntentMetadata(raw)',
              'decoded.append(raw.charAt(index++))',
              'asciiHexValue(raw.charAt(index + 1))',
              'asciiHexValue(raw.charAt(index + 2))',
              'CodingErrorAction.REPORT',
              'MAX_INPUT_LENGTH = 2048',
              'hasExplicitEmptyPort(baseUri)',
              'hasExplicitEmptyPort(targetUri)'):
    assert token in policy, f"Intent URI parser missing {token}"
for forbidden in ('Character.digit(', '"component".equals(key)', '"selector".equals(key)',
                  '"launchFlags".equals(key)', '"S.".equals(key)'):
    assert forbidden not in policy, f"Intent URI parser must not accept {forbidden}"

assert "BrowserIntentLinkPolicy.parse(value)" in webview
assert "BrowserUriHandoff.createBrowsableViewIntent(" in webview
assert "BrowserUriHandoff.confirmAndOpen(" in webview
assert "new Intent(Intent.ACTION_VIEW, uri)" in handoff
assert "external.addCategory(Intent.CATEGORY_BROWSABLE)" in handoff
assert "external.setPackage(packageName)" in handoff
assert "PackageManager.MATCH_DEFAULT_ONLY" in handoff
assert "resolved.loadLabel(packageManager)" in handoff
assert '"Resolved destination: " + address' in handoff
assert "showUnavailable(context, onUnavailable)" in handoff
assert '"No compatible Android app could be resolved. Nothing was opened."' in handoff
assert '.setPositiveButton("Open"' in handoff
assert '"Stay in Daymark"' in handoff
assert '"This Android app link was not opened: " + invalid.getMessage()' in activity
assert '"This Android app link was blocked because its Intent data is unsafe."' in webview
assert "BrowserUriRoutingPolicy.routeForScheme(scheme)" in webview
assert "BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(" in webview
intent_route = webview.split('if ("intent".equalsIgnoreCase(scheme))', 1)[1].split("// Verified HTTP(S)", 1)[0]
assert "BrowserIntentHandoffPolicy.allows(request.isForMainFrame(), request.hasGesture())" in intent_route \
    and "return handleIntentLink(view, url)" in intent_route, \
    "intent links must retain the main-frame/user-gesture gate before strict parsing"
external_route = webview.split("if (route == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION)", 1)[1]
external_route = external_route.split('if ("daymark-download"', 1)[0]
assert "BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(" in external_route \
    and "BrowserUriHandoff.confirmAndOpen(" in external_route, \
    "external URI handoffs must retain user-gesture gating and explicit confirmation"
offline_gate = "if (!networkPolicy.allowsRemoteLoads()) {\n                    listener.onOfflineNavigationBlocked();"
assert webview.index('if ("intent".equalsIgnoreCase(scheme))') < webview.index(offline_gate) \
    and webview.index("if (route == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION)") < webview.index(offline_gate), \
    "requested Android app schemes must reach their confirmation policy before generic Offline blocking"
assert "BrowserUriRoutingPolicy.isOfflinePermittedWebViewScheme(scheme)" in webview, \
    "only explicitly local WebView schemes may bypass the Offline navigation gate"
assert "BrowserUriRoutingPolicy.OFFLINE_NON_WEB_BLOCKED_NOTICE" in webview, \
    "unlisted non-web in-page links must be visibly blocked while Offline"
assert "settings.setAllowFileAccess(false)" in webview and "settings.setAllowContentAccess(false)" in webview
local_attempt = "Daymark WebView will try this URI, but local file and content-provider access is disabled for safety."
local_blocked = "Daymark WebView could not open this URI because local file and content-provider access is disabled for safety."
assert local_attempt in uri_policy and local_blocked in uri_policy \
    and "BrowserUriRoutingPolicy.LOCAL_RESOURCE_ATTEMPT_NOTICE" in activity \
    and "BrowserUriRoutingPolicy.LOCAL_RESOURCE_ATTEMPT_NOTICE" in webview, \
    "typed and in-page local-resource attempts/refusals must explain the unchanged isolation"
local_branch = webview.split("if (route == BrowserUriRoutingPolicy.Route.LOCAL_WEBVIEW)", 1)[1]
local_branch = local_branch.split("if (route == BrowserUriRoutingPolicy.Route.WEBVIEW", 1)[0]
assert "showLocalResourceAccessNotice(view, false)" in local_branch and "return false;" in local_branch, \
    "file/content callbacks must be visibly dispatched to WebView rather than consumed"
assert "request.isForMainFrame()" not in local_branch, \
    "subframe local-resource navigation must not be silently ignored"
error_callback = webview.split(
    "public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error)", 1
)[1].split("@Override", 1)[0]
assert error_callback.index("isLocalResourceAddress(failingUrl)") < error_callback.index("if (!request.isForMainFrame())"), \
    "local access refusals must be visible for subframes before main-frame filtering"
excluded_attempt = "This browser/system URI stays in Daymark; WebView may not support it, and it will not be sent to another app."
excluded_blocked = "Daymark WebView could not open this browser/system URI. It was not sent to another app."
excluded_offline = "This browser/system URI is unavailable while Daymark is Offline. It was not sent to another app."
assert excluded_attempt in uri_policy and excluded_blocked in uri_policy and excluded_offline in uri_policy \
    and "BrowserUriRoutingPolicy.EXCLUDED_SCHEME_ATTEMPT_NOTICE" in activity \
    and "BrowserUriRoutingPolicy.EXCLUDED_SCHEME_ATTEMPT_NOTICE" in webview \
    and "BrowserUriRoutingPolicy.EXCLUDED_SCHEME_OFFLINE_NOTICE" in activity \
    and "BrowserUriRoutingPolicy.EXCLUDED_SCHEME_OFFLINE_NOTICE" in webview, \
    "excluded browser/system URI attempts and refusals must explain the WebView-only policy"
excluded_branch = webview.split("if (BrowserUriRoutingPolicy.isExplicitlyExcludedScheme(scheme))", 1)[1]
excluded_branch = excluded_branch.split("if (route == BrowserUriRoutingPolicy.Route.LOCAL_WEBVIEW)", 1)[0]
assert "showExcludedSchemeNotice(view, false)" in excluded_branch and "return false;" in excluded_branch, \
    "excluded schemes must be visibly offered to WebView, not consumed or externally handed off"
assert error_callback.index("isExcludedSchemeAddress(failingUrl)") < error_callback.index("if (!request.isForMainFrame())"), \
    "excluded-scheme refusals must be visible for subframes before main-frame filtering"
for scheme in ("vbscript", "chrome", "chrome-extension", "devtools", "view-source"):
    assert f'case "{scheme}"' in uri_policy
assert "isExplicitlyExcludedScheme(scheme)" in callback_test and "must never request Android confirmation" in callback_test
assert "BrowserAddress.resolveInput(address," in typed_test, "typed URI input must have its own address-path tests"
assert "BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, true, scheme)" in callback_test, \
    "in-page links must have separate main-frame/gesture callback tests"
assert "reject-component" in contract and "launchFlags=0x1" in contract
assert 'launchFlags=0x00000001' in test.read_text(encoding="utf-8")
assert 'launchFlags=0x00000003' in test.read_text(encoding="utf-8")
assert "Intent.parseUri(" not in webview, "untrusted serialized Intent objects must never be launched"
assert "BrowserIntentLinkPolicySmoke.java" in runner
assert "BrowserIntentLinkPolicy.java" in runner
assert test.is_file()
print("PASS safe Android intent link source guard")
