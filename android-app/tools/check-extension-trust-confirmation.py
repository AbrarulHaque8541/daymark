#!/usr/bin/env python3
"""Guard active extension-import trust disclosures and modern settings wiring."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
parser = (root / "app/src/main/java/com/abrar/daymark/ExtensionPackageParser.java").read_text(encoding="utf-8")

# Keep the dedicated helper safe for any future callers.
helper_flow = activity.split("private void importExtensionFromUri", 1)[1].split(
    "private void confirmAndInstallExtension", 1
)[0]
assert "confirmAndInstallExtension(ext);" in helper_flow, "helper imports must pass through explicit review"
assert "installUserPack(ext)" not in helper_flow, "helper import must not persist code before confirmation"

review = activity.split("private void confirmAndInstallExtension", 1)[1].split(
    "private void showBrowserExtensionsManager", 1
)[0]
for marker in (
    'setTitle("Review before adding")',
    'setNegativeButton("Cancel"',
    'setPositiveButton("Trust & add"',
    "TRUST WARNING",
    "matching website page content",
    "send it to an external service",
    "none (does not run on pages)",
    "installUserPack(ext)",
):
    assert marker in review, f"extension trust review helper missing marker: {marker}"
assert review.index('setPositiveButton("Trust & add"') < review.index("installUserPack(ext)"), \
    "persist helper-imported code only from the explicit positive action"

# The currently reachable ACTION_OPEN_DOCUMENT result uses a separate dialog. Its parsed warnings
# must be included in that dialog before the user can persist the pack.
activity_result = activity.split("protected void onActivityResult", 1)[1].split(
    "private int themeResource", 1
)[0]
active_import = activity_result.split("if (requestCode == REQUEST_IMPORT_EXTENSION)", 1)[1].split(
    "UpdaterActivityResultRouter.Route", 1
)[0]
for marker in ("parsed.warnings", ".setMessage(summary)", 'setPositiveButton("Install"', "installUserPack(parsed)"):
    assert marker in active_import, f"active extension import review missing marker: {marker}"
assert active_import.index("parsed.warnings") < active_import.index(".setMessage(summary)") \
        < active_import.index('setPositiveButton("Install"') < active_import.index("installUserPack(parsed)"), \
    "the active import dialog must show parser trust warnings before the user installs a pack"

for marker in (
    "not an isolated extension sandbox",
    "read and change that page's content",
    "could send that data to an external service",
    "Daymark exposes no native bridge to the script",
    "New imports start disabled",
):
    assert marker in parser, f"import parser trust disclosure missing marker: {marker}"

settings = activity.split("private void showSettingsDialog()", 1)[1].split(
    "private void addSettingsSection", 1
)[0]
for marker in (
    "PERSONALIZE",
    "ACCESSIBILITY & DATA",
    "POWER FEATURES",
    "addSettingsRow(content",
    "content.animate().alpha(1f).translationY(0f).setDuration(160L).start()",
):
    assert marker in settings, f"modern More settings missing marker: {marker}"
assert '.setItems(options' not in settings, "More must not regress to a flat legacy item list"

print("PASS: active/helper extension trust disclosures and modern More settings wiring")
