#!/usr/bin/env python3
"""Source-level contract for the Daymark splash (opening) screen.

Asserts that the launcher entry point is exactly one SplashActivity, that MainActivity keeps
its share/process-text intent filters but is no longer the launcher, that the pinned
component inventory (no services, one receiver, one provider, flavor manifests untouched)
is preserved, and that SplashActivity shows the DAYMARK / BY ABRARUL HAQUE branding and
hands off to MainActivity safely without WebView, runtime permissions or JS bridges.
"""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
android = "{http://schemas.android.com/apk/res/android}"

manifest = ET.parse(root / "app/src/main/AndroidManifest.xml").getroot()
app = manifest.find("application")
assert app is not None, "missing application element"

activities = app.findall("activity")
launchers = []
for activity in activities:
    for intent_filter in activity.findall("intent-filter"):
        actions = {a.get(android + "name") for a in intent_filter.findall("action")}
        categories = {c.get(android + "name") for c in intent_filter.findall("category")}
        if "android.intent.action.MAIN" in actions and "android.intent.category.LAUNCHER" in categories:
            launchers.append(activity.get(android + "name"))
assert launchers == [".SplashActivity"], f"exactly one LAUNCHER activity (.SplashActivity) expected, got {launchers}"

by_name = {a.get(android + "name"): a for a in activities}
splash = by_name.get(".SplashActivity")
assert splash is not None, "SplashActivity must be declared"
assert splash.get(android + "exported") == "true", "splash must be exported as the launcher entry point"

main = by_name.get(".MainActivity")
assert main is not None, "MainActivity must remain declared"
assert main.get(android + "exported") == "true", "MainActivity must stay exported for share/process-text intents"
main_actions = set()
for intent_filter in main.findall("intent-filter"):
    main_actions |= {a.get(android + "name") for a in intent_filter.findall("action")}
    for c in intent_filter.findall("category"):
        assert c.get(android + "name") != "android.intent.category.LAUNCHER", \
            "MainActivity must no longer hold the LAUNCHER category"
assert "android.intent.action.SEND" in main_actions, "MainActivity must keep the share intent filter"
assert "android.intent.action.PROCESS_TEXT" in main_actions, "MainActivity must keep the process-text intent filter"

# Pinned component inventory: no services, exactly one receiver, exactly one provider.
assert not list(app.findall("service")), "V1 must not add services"
receivers = app.findall("receiver")
assert len(receivers) == 1 and receivers[0].get(android + "name") == ".TaskReminderReceiver", \
    "only the task-reminder boot receiver is allowed"
providers = app.findall("provider")
assert len(providers) == 1 and providers[0].get(android + "name") == ".AttachmentContentProvider", \
    "only the attachment content provider is allowed"

# Flavor manifests must not gain components.
for flavor in ("play", "githubSideload"):
    flavor_app = ET.parse(root / f"app/src/{flavor}/AndroidManifest.xml").getroot().find("application")
    assert flavor_app is not None and not list(flavor_app), f"{flavor} flavor must not add components"

source = (root / "app/src/main/java/com/abrar/daymark/SplashActivity.java").read_text(encoding="utf-8")
assert source.startswith("package com.abrar.daymark;"), "splash must live in the approved package"
for marker in (
    "SplashPolicy.BRAND_TITLE",
    "SplashPolicy.BRAND_SUBTITLE",
    "Settings.Global.TRANSITION_ANIMATION_SCALE",
    "SplashPolicy.splashHoldMs(",
    "postDelayed(",
    "new Intent(this, MainActivity.class)",
    "startActivity(intent)",
    "finish()",
    "removeCallbacksAndMessages(null)",
    "R.drawable.ic_launcher",
    "@Override\n    protected void onCreate(Bundle savedInstanceState)",
):
    assert marker in source, f"missing splash source marker: {marker}"
# Forbidden APIs/types must not appear in executable source. Strip block and line comments so
# explanatory javadoc (e.g. "no embedded browser") cannot false-positive the contract.
import re
code_only = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
code_only = re.sub(r"//.*?$", "", code_only, flags=re.M)
for forbidden in ("addJavascriptInterface(", "requestPermissions(", "WebView", "loadUrl("):
    assert forbidden not in code_only, f"splash executable source must not contain: {forbidden}"

policy = (root / "app/src/main/java/com/abrar/daymark/SplashPolicy.java").read_text(encoding="utf-8")
for marker in ('BRAND_TITLE = "DAYMARK"', 'BRAND_SUBTITLE = "BY ABRARUL HAQUE"', "animationsEnabled("):
    assert marker in policy, f"missing splash policy marker: {marker}"

print("PASS splash source: single SplashActivity launcher, pinned component inventory, "
      "DAYMARK / BY ABRARUL HAQUE branding, reduced-motion handling, safe MainActivity handoff")
