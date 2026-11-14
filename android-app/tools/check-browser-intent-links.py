#!/usr/bin/env python3
"""Source guard for safe Android intent:// links in the embedded browser."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserIntentLinkPolicy.java").read_text(encoding="utf-8")
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
local_refusal = "File and content access stays disabled in Daymark for safety. Nothing was opened."
assert local_refusal in activity and local_refusal in webview, \
    "typed and in-page local-resource attempts must explain the existing isolation"
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
