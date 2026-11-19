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
test_source = test.read_text(encoding="utf-8")
typed_test = (root / "tools/BrowserAddressSmoke.java").read_text(encoding="utf-8")
callback_test = (root / "tools/BrowserExternalLinkPolicySmoke.java").read_text(encoding="utf-8")
source_check = (root / "tools/check-v1-source.sh").read_text(encoding="utf-8")
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
              'hasExplicitEmptyPort(targetUri)',
              'static boolean isSupportedTargetScheme(String scheme)',
              'BrowserUriRoutingPolicy.isWebScheme(scheme)',
              'BrowserAddress.isExplicitExternalScheme(scheme)',
              'if (!isSupportedTargetScheme(scheme))',
              'Android app link target scheme is not supported.'):
    assert token in policy, f"Intent URI parser missing {token}"
for forbidden in ('Character.digit(', '"component".equals(key)', '"selector".equals(key)',
                  '"launchFlags".equals(key)', '"S.".equals(key)'):
    assert forbidden not in policy, f"Intent URI parser must not accept {forbidden}"

for sample in (
    'intent://example.com/path#Intent;scheme=https;component=com.example/.MainActivity;S.debug=1;end',
    'intent://example.com/path#Intent;scheme=https;launchFlags=0x00000003;end',
):
    assert sample in test_source and sample in typed_test, \
        "malicious component/extra and URI-grant cases must be covered by parser and typed-address smoke tests"
assert "expectUnsupportedTarget(" in test_source, "unsupported targets need an executable parser regression"
assert "BrowserIntentLinkPolicy.parse(resolved)" in typed_test \
    and "BrowserUriRoutingPolicy.Route.INTENT_CONFIRMATION" in typed_test, \
    "typed-address smoke must route malicious Intent input through the strict parser"
assert '"$ROOT/tools/BrowserIntentLinkPolicySmoke.java"' in runner \
    and 'java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserIntentLinkPolicySmoke "$ROOT/../contracts/intent-uri-validation.tsv"' in runner, \
    "the strict Intent parser smoke must be compiled and executed by the core runner"
assert '"$ROOT/tools/BrowserAddressSmoke.java"' in runner \
    and 'java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserAddressSmoke' in runner, \
    "typed-address smoke must be compiled and executed by the core runner"
assert 'python3 "$ROOT/tools/check-browser-intent-links.py" "$ROOT"' in runner \
    and 'sh ./tools/run-core-tests.sh' in source_check \
    and 'python3 ./tools/check-browser-intent-links.py "$ROOT"' in source_check, \
    "intent source guard and core smoke tests must be wired into canonical Android source checks"

assert "BrowserIntentLinkPolicy.parse(value)" in webview
assert "BrowserUriHandoff.createBrowsableViewIntent(" in webview
assert "BrowserUriHandoff.confirmAndOpen(" in webview
intent_handler = webview.split("private boolean handleIntentLink(WebView view, String value)", 1)[1].split("\n    }", 1)[0]
assert "catch (BrowserIntentLinkPolicy.UnsupportedTargetException unsupported)" in intent_handler
assert "This Android app link uses an unsupported target scheme. Nothing was opened." in intent_handler
assert "This Android app link was not opened: its target or Intent data is unsupported or unsafe." in intent_handler
target_guard = "if (!BrowserIntentLinkPolicy.isSupportedTargetScheme(scheme))"
assert target_guard in intent_handler and "unsupported target scheme. Nothing was opened." in intent_handler, \
    "unsupported resolved target schemes must show a visible refusal"
assert intent_handler.index(target_guard) < intent_handler.index("BrowserUriHandoff.createBrowsableViewIntent(") \
    and intent_handler.index("return true;", intent_handler.index(target_guard)) < intent_handler.index("BrowserUriHandoff.createBrowsableViewIntent("), \
    "unsupported resolved targets must return before any Android intent or chooser is created"
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
assert '"This Android app link was not opened: its target or Intent data is unsupported or unsafe."' in webview
assert '"This Android app link uses an unsupported target scheme. Nothing was opened."' in webview
typed_route = "if (route == BrowserUriRoutingPolicy.Route.INTENT_CONFIRMATION)"
assert typed_route in activity, "typed address-bar intent confirmation route must remain in MainActivity"
typed_intent = activity.split(typed_route, 1)[1]
typed_intent = typed_intent.split("if (route == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION)", 1)[0]
typed_target_guard = "BrowserIntentLinkPolicy.isSupportedTargetScheme(target.getScheme())"
assert "BrowserIntentLinkPolicy.parse(webAddress)" in typed_intent, \
    "typed intent addresses must use the shared strict metadata parser"
assert "Intent.parseUri(" not in typed_intent, \
    "typed intent addresses must not invoke Android's permissive serialized-Intent parser"
assert "catch (BrowserIntentLinkPolicy.UnsupportedTargetException unsupported)" in typed_intent \
    and "This Android app link uses an unsupported target scheme. Nothing was opened." in typed_intent, \
    "typed unsupported targets must have a visible refusal"
assert "This Android app link was blocked because its Intent data is unsafe. Nothing was opened." in typed_intent, \
    "typed unsafe metadata must have a visible refusal"
assert typed_target_guard in typed_intent and typed_intent.index(typed_target_guard) \
    < typed_intent.index("BrowserUriHandoff.createBrowsableViewIntent("), \
    "typed intent target validation must precede any Android handoff"
assert "Uri.parse(decision.targetUri)" in typed_intent \
    and "BrowserUriHandoff.createBrowsableViewIntent(\n                    target, decision.packageName)" in typed_intent, \
    "typed handoff must be rebuilt only from the sanitized URI and validated package"
assert "BrowserUriHandoff.confirmAndOpen(this, external, decision.targetUri, null)" in typed_intent, \
    "typed confirmation must show the resolved destination, not serialized metadata"
assert "BrowserUriRoutingPolicy.routeForScheme(scheme)" in webview
assert "BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(" in webview
assert "Route.EXTERNAL_CONFIRMATION : Route.REJECTED;" in uri_policy, \
    "only explicitly approved external schemes may leave the WebView path"
rejected_navigation = webview.split(
    "if (route == BrowserUriRoutingPolicy.Route.REJECTED)", 1)[1]
rejected_navigation = rejected_navigation.split(
    "if (route == BrowserUriRoutingPolicy.Route.LOCAL_WEBVIEW)", 1)[0]
assert "showRejectedSchemeNotice(view)" in rejected_navigation and "return true;" in rejected_navigation, \
    "unapproved in-page schemes must show a refusal and stop before WebView navigation"
assert "if (route == BrowserUriRoutingPolicy.Route.REJECTED)" in activity \
    and "BrowserUriRoutingPolicy.REJECTED_SCHEME_NOTICE" in activity, \
    "unapproved typed addresses must show an accessible refusal before WebView loadUrl"
intent_route = webview.split('if ("intent".equalsIgnoreCase(scheme))', 1)[1].split("// Verified HTTP(S)", 1)[0]
assert "BrowserIntentHandoffPolicy.allows(request.isForMainFrame(), request.hasGesture())" in intent_route \
    and "return handleIntentLink(view, url)" in intent_route, \
    "intent links must retain the main-frame/user-gesture gate before strict parsing"
external_route = webview.split("if (route == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION)", 1)[1]
external_route = external_route.split('if ("daymark-download"', 1)[0]
assert "BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(" in external_route \
    and "BrowserUriHandoff.confirmAndOpen(" in external_route, \
    "external confirmation must stay gated"
print("PASS intent link safety guards (aligned with current WebView routing)")
