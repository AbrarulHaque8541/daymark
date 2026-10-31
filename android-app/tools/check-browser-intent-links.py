#!/usr/bin/env python3
"""Source guard for safe Android intent:// links in the embedded browser."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserIntentLinkPolicy.java").read_text(encoding="utf-8")
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
test = root / "tools/BrowserIntentLinkPolicySmoke.java"

for token in ('value.startsWith("intent://")', '"#Intent;"', 'value.endsWith(";end")',
              '"scheme".equals(key)', '"package".equals(key)',
              '"action".equals(key)', '"category".equals(key)',
              '"S.browser_fallback_url".equals(key)', 'values.containsKey(key)',
              'targetUri.getRawUserInfo() != null',
              'BrowserAddress.requireAllowedWebUrl(fallback)',
              'decodeIntentMetadata(raw)',
              'raw.replace("+", "%2B")'):
    assert token in policy, f"Intent URI parser missing {token}"
for forbidden in ('"component".equals(key)', '"selector".equals(key)',
                  '"launchFlags".equals(key)', '"S.".equals(key)'):
    assert forbidden not in policy, f"Intent URI parser must not accept {forbidden}"

assert "BrowserIntentLinkPolicy.parse(value)" in webview
assert "new android.content.Intent(" in webview
assert "external.addCategory(android.content.Intent.CATEGORY_BROWSABLE)" in webview
assert "external.setPackage(decision.packageName)" in webview
assert "Intent.parseUri(" not in webview, "untrusted serialized Intent objects must never be launched"
assert "BrowserIntentLinkPolicySmoke.java" in runner
assert "BrowserIntentLinkPolicy.java" in runner
assert test.is_file()
print("PASS safe Android intent link source guard")
