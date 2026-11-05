#!/usr/bin/env python3
"""Source-level regression contract for Daymark's single AndroidX system splash."""
from pathlib import Path
import re
import struct
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
android = "{http://schemas.android.com/apk/res/android}"

manifest_path = root / "app/src/main/AndroidManifest.xml"
manifest = ET.parse(manifest_path).getroot()
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
assert splash is not None, "SplashActivity must remain as a non-rendering launch router"
assert splash.get(android + "exported") == "true", "launcher router must be exported"
assert splash.get(android + "theme") == "@style/DaymarkSplashTheme", "launcher must use the AndroidX system-splash theme"

assert app.get(android + "icon") == "@drawable/ic_launcher", "keep the existing Daymark launcher resource name"
assert app.get(android + "roundIcon") == "@drawable/ic_launcher", "keep the existing Daymark round-icon resource name"

main = by_name.get(".MainActivity")
assert main is not None, "MainActivity must remain declared"
assert main.get(android + "exported") == "true", "MainActivity must stay exported for share/process-text intents"
main_actions = set()
for intent_filter in main.findall("intent-filter"):
    main_actions |= {a.get(android + "name") for a in intent_filter.findall("action")}
    for category in intent_filter.findall("category"):
        assert category.get(android + "name") != "android.intent.category.LAUNCHER", \
            "MainActivity must not become a second launcher"
assert "android.intent.action.SEND" in main_actions, "MainActivity must keep the share intent filter"
assert "android.intent.action.PROCESS_TEXT" in main_actions, "MainActivity must keep the process-text intent filter"

# Preserve the V1 component inventory and keep flavor manifests free of extra components.
assert not list(app.findall("service")), "V1 must not add services"
receivers = app.findall("receiver")
assert len(receivers) == 1 and receivers[0].get(android + "name") == ".TaskReminderReceiver", \
    "only the task-reminder boot receiver is allowed"
providers = app.findall("provider")
assert len(providers) == 1 and providers[0].get(android + "name") == ".AttachmentContentProvider", \
    "only the attachment content provider is allowed"
for flavor in ("play", "githubSideload"):
    flavor_app = ET.parse(root / f"app/src/{flavor}/AndroidManifest.xml").getroot().find("application")
    assert flavor_app is not None and not list(flavor_app), f"{flavor} flavor must not add components"

# AndroidX owns the compatibility attributes. The native branding-image attribute is API 31+ only.
res_dir = root / "app/src/main/res"
styles = ET.parse(res_dir / "values/styles.xml").getroot()
splash_theme = next((style for style in styles.findall("style") if style.get("name") == "DaymarkSplashTheme"), None)
assert splash_theme is not None and splash_theme.get("parent") == "Theme.SplashScreen", \
    "DaymarkSplashTheme must inherit from AndroidX Theme.SplashScreen"
theme_items = {item.get("name"): (item.text or "").strip() for item in splash_theme.findall("item")}
assert theme_items.get("windowSplashScreenBackground") == "@color/daymark_splash_background"
assert theme_items.get("windowSplashScreenAnimatedIcon") == "@drawable/ic_launcher"
assert theme_items.get("postSplashScreenTheme") == "@style/AppTheme", "router must restore the real app theme"
assert "windowSplashScreenBrandingImage" not in theme_items, \
    "the platform-only branding attribute must not be in unqualified values"

styles_v31 = ET.parse(res_dir / "values-v31/styles.xml").getroot()
splash_theme_v31 = next((style for style in styles_v31.findall("style") if style.get("name") == "DaymarkSplashTheme"), None)
assert splash_theme_v31 is not None and splash_theme_v31.get("parent") == "Theme.SplashScreen", \
    "API 31+ splash theme must inherit from AndroidX Theme.SplashScreen"
theme_items_v31 = {item.get("name"): (item.text or "").strip() for item in splash_theme_v31.findall("item")}
assert theme_items_v31.get("windowSplashScreenBackground") == "@color/daymark_splash_background"
assert theme_items_v31.get("windowSplashScreenAnimatedIcon") == "@drawable/ic_launcher"
assert theme_items_v31.get("postSplashScreenTheme") == "@style/AppTheme"
assert theme_items_v31.get("android:windowSplashScreenBrandingImage") == "@drawable/daymark_splash_branding", \
    "API 31+ must use the platform branding attribute in its Android namespace"

colors = ET.parse(root / "app/src/main/res/values/colors.xml").getroot()
color_values = {color.get("name"): (color.text or "").strip().upper() for color in colors.findall("color")}
assert color_values.get("daymark_splash_background") == "#0E2A21", "retain the original splash green"
assert color_values.get("daymark_icon_background") == "#315B46", "retain the existing icon background color"

source = (root / "app/src/main/java/com/abrar/daymark/SplashActivity.java").read_text(encoding="utf-8")
assert source.startswith("package com.abrar.daymark;"), "router must stay in the approved package"
code_only = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
code_only = re.sub(r"//.*?$", "", code_only, flags=re.M)
install = code_only.index("SplashScreen.installSplashScreen(this)")
super_on_create = code_only.index("super.onCreate(savedInstanceState)")
hold = code_only.index("setKeepOnScreenCondition(() -> true)")
start = code_only.index("startActivity(intent)")
finish = code_only.index("finish()", start)
assert install < super_on_create < hold < start < finish, \
    "install compat splash before super, hold the system splash, then route and finish"
for marker in ("new Intent(this, MainActivity.class)", "original.getAction()", "original.getData()",
               "original.getExtras()", "intent.putExtras(original.getExtras())"):
    assert marker in code_only, f"router must preserve existing launch behavior: {marker}"
for forbidden in ("setContentView(", "postDelayed(", "overridePendingTransition(", "Handler(",
                  "Settings.Global", "addJavascriptInterface(", "requestPermissions(", "WebView", "loadUrl(" ):
    assert forbidden not in code_only, f"routing-only splash must not draw UI or access unrelated APIs: {forbidden}"

# Brand copy remains both test-pinned and visible on the system splash; the PNG is 200 x 80 dp at xxhdpi.
policy = (root / "app/src/main/java/com/abrar/daymark/SplashPolicy.java").read_text(encoding="utf-8")
smoke = (root / "tools/SplashPolicySmoke.java").read_text(encoding="utf-8")
branding_html = (root / "tools/splash-branding.html").read_text(encoding="utf-8")
for text in ("DAYMARK", "BY ABRARUL HAQUE"):
    assert f'"{text}"' in policy and f'"{text}"' in smoke, f"host test must pin splash copy: {text}"
    assert f">{text}<" in branding_html, f"system branding source must display exact copy: {text}"
branding_png = root / "app/src/main/res/drawable-xxhdpi/daymark_splash_branding.png"
png_bytes = branding_png.read_bytes()
assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n", "system branding asset must be a PNG"
assert struct.unpack(">II", png_bytes[16:24]) == (600, 240), "branding PNG must be 200 x 80 dp at xxhdpi"

# Existing vector remains the legacy fallback; Android 8+ gets adaptive layers made from its same mark/colors.
legacy_icon = ET.parse(root / "app/src/main/res/drawable/ic_launcher.xml").getroot()
assert legacy_icon.tag == "vector", "keep the original vector as the adaptive-icon fallback"
legacy_paths = [path.get(android + "pathData") for path in legacy_icon.findall("path")]
assert legacy_paths[0] == "M12,3h24a9,9 0,0 1,9 9v24a9,9 0,0 1,-9 9h-24a9,9 0,0 1,-9 -9v-24a9,9 0,0 1,9 -9z"
adaptive = ET.parse(root / "app/src/main/res/drawable-anydpi-v26/ic_launcher.xml").getroot()
assert adaptive.tag == "adaptive-icon", "Android 8+ launcher resource must be adaptive"
layers = {layer.tag: layer.get(android + "drawable") for layer in adaptive}
assert layers == {"background": "@color/daymark_icon_background",
                  "foreground": "@drawable/ic_launcher_foreground",
                  "monochrome": "@drawable/ic_launcher_foreground"}, \
    "adaptive icon must reuse the exact brand background and foreground mark"
foreground = ET.parse(root / "app/src/main/res/drawable/ic_launcher_foreground.xml").getroot()
foreground_paths = foreground.findall("path")
assert len(foreground_paths) == 1 and foreground_paths[0].get(android + "fillColor").upper() == "#F6F7F4"
assert foreground_paths[0].get(android + "pathData") == \
    "M37.5,42h6v25.5h-6zM51,33h6v34.5h-6zM64.5,48h6v19.5h-6z", \
    "adaptive foreground must be the existing three-bar mark scaled into the safe zone"

print("PASS splash source: one AndroidX splash, non-rendering handoff, preserved intents and brand, adaptive icon, pinned components")
