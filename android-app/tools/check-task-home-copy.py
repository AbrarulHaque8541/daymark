#!/usr/bin/env python3
"""Regression checks for task-home copy and the live encrypted-storage status."""
from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
ACTIVITY = (ROOT / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


check("New tasks start with no due date and medium priority" not in ACTIVITY,
      "task home no longer explains the quick-add defaults")
check("addLocalStorageNote" not in ACTIVITY,
      "the long encryption footer helper is removed from task home")
check("Tasks and attachments stay encrypted in this app on this device. No cloud sync or automatic backup." not in ACTIVITY,
      "the long encryption footer copy is not rendered elsewhere in MainActivity")
check('captureFeedback = text(powerMode' in ACTIVITY
      and '"Power path adds search, filters, and ranked demo suggestions. It uses the same tasks."' in ACTIVITY,
      "the separate Power-path helper copy remains unchanged")

status_start = ACTIVITY.index("private void addPrivacyCard(LinearLayout content)")
status_end = ACTIVITY.index("private View buildSharedComposer()", status_start)
status_row = ACTIVITY[status_start:status_end]
check("storageStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);" in status_row,
      "the live storage status keeps its polite accessibility announcements")
check("cancelAttachmentButton = compactButton(\"Cancel\", true);" in status_row,
      "the cancel action remains attached to the status row")
check(status_row.count("storageStatus.addTextChangedListener(new TextWatcher()") == 1,
      "one watcher observes every live storage-status update")
check(bool(re.search(
          r'storageStatus\.setVisibility\("Encrypted storage ready"\.contentEquals\(text\)\s*\?\s*View\.GONE\s*:\s*View\.VISIBLE\);',
          status_row)),
      "only the exact steady-state ready message is hidden; every other text is visible")
check(ACTIVITY.count("storageStatus.setVisibility(") == 1,
      "no independent visibility path can hide loading, import, failure, or unsaved status")

for message in (
    "Opening encrypted storage…",
    "Importing attachment…",
    "Saving encrypted tasks…",
    "Not saved · unsaved changes are shown",
    "Importing encrypted attachment…",
    "Saving attachment metadata…",
    "Attachment save could not be verified",
    "Attachment removal not saved",
    "Encrypting private backup…",
    "Choose a destination for the new backup file…",
    "Writing encrypted backup through Android's document picker…",
    "Authenticating and validating the full backup privately…",
    "Committing encrypted task snapshot…",
    "Restore outcome not verified · reopen Daymark",
    "Saved tasks unavailable",
):
    check(message in ACTIVITY, f"operational status remains available: {message}")

check("These changes are not saved and may be lost if you leave." in ACTIVITY,
      "unsaved task edits retain their separate actionable feedback")
check("Saved tasks could not be opened. The app did not save or clear data; editing is paused." in ACTIVITY,
      "task-load failures retain their separate actionable feedback")

settings_start = ACTIVITY.index("private void showSettingsDialog()")
settings_end = ACTIVITY.index("private void showPermissionStatus()", settings_start)
settings = ACTIVITY[settings_start:settings_end]
check('addSettingsRow(content, "Encrypted backup & restore"' in settings,
      "Settings retains the encrypted backup and restore entry")
details_start = ACTIVITY.index("private void showAdvancedDetails()")
details_end = ACTIVITY.index("private void copyDiagnostics()", details_start)
details = ACTIVITY[details_start:details_end]
check("Encryption: AES-GCM; the key is stored in Android Keystore." in details,
      "Advanced Settings retains the truthful encryption and key-storage disclosure")
check("Hardware protection depends on the device." in details,
      "Advanced Settings retains the device-dependent hardware-protection caveat")

print(f"PASS task-home copy/status checks: {checks} assertions")
