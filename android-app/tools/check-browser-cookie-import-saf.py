#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = (ROOT / "app/src/main/java/com/abrar/daymark/BrowserCookieImportFlow.java").read_text(encoding="utf-8")
PARSER = (ROOT / "app/src/main/java/com/abrar/daymark/BrowserCookieImport.java").read_text(encoding="utf-8")
POLICY = (ROOT / "app/src/main/java/com/abrar/daymark/BrowserCookieImportPolicy.java").read_text(encoding="utf-8")
MANIFEST = (ROOT / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")

for marker in (
    "Intent.ACTION_OPEN_DOCUMENT",
    "Intent.CATEGORY_OPENABLE",
    "Intent.FLAG_GRANT_READ_URI_PERMISSION",
    "activity.getContentResolver().openInputStream",
    "openInputStream(selectedUri)",
    "MAX_FILE_BYTES",
    "CodingErrorAction.REPORT",
    "BrowserCookieImport.parse(text)",
    "CookieManager.getInstance()",
    "cookieManager.setCookie(",
    "cookieManager.flush()",
    "Cookie import preview",
    "Confirm cookie import",
    "I understand these cookies are session credentials.",
):
    assert marker in FLOW, f"missing SAF/confirmation safety marker: {marker}"

for forbidden in (
    "takePersistableUriPermission",
    "FLAG_GRANT_PERSISTABLE_URI_PERMISSION",
    "READ_EXTERNAL_STORAGE",
    "MANAGE_EXTERNAL_STORAGE",
    "getExternalStorageDirectory",
    "getExternalFilesDir",
    "PackageManager",
    "queryIntentActivities",
    "MainActivity",
    "Log.",
):
    assert forbidden not in FLOW, f"forbidden private-data or integration shortcut: {forbidden}"

for forbidden_permission in (
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.MANAGE_EXTERNAL_STORAGE",
):
    assert forbidden_permission not in MANIFEST, f"broad storage permission added: {forbidden_permission}"

assert "isValidValue" in PARSER and "c == ';'" in PARSER
assert "MAX_REJECTED_LINES_RETAINED" in PARSER and "MAX_LINES" in PARSER
assert "hasValidPrefixSemantics" in POLICY
assert "selectedDomains" in FLOW
assert "Cookie values are hidden" in FLOW
assert "SameSite metadata" in FLOW
print("PASS browser cookie import SAF guard: explicit user-picked URI, bounded strict UTF-8 read, no persistent grant/broad storage permission/private-app scan, domain selection and second confirmation")
