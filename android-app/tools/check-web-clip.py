#!/usr/bin/env python3
"""Guard the explicit Reader-to-encrypted-task clipping path and its privacy boundary."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
source = root / "app/src/main/java/com/abrar/daymark"
activity = (source / "MainActivity.java").read_text(encoding="utf-8")
clip = (source / "WebClip.java").read_text(encoding="utf-8")
instrumentation = (root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java").read_text(encoding="utf-8")
reader = activity.split("private void showReaderModeDialog", 1)[1].split(
    "private void showPendingWebClip", 1
)[0]
composer = activity.split("private void showPendingWebClip", 1)[1].split(
    "private void openFullScreenWebView", 1
)[0]
page_task = activity.split("private void saveCurrentPageAsTask", 1)[1].split(
    "private void bookmarkCurrentBrowserPage", 1
)[0]
for marker in (
    'primaryButton("Clip to task")',
    "final String readerSourceUrl = browserWebView == null ? null : browserWebView.getUrl();",
    "if (!canEdit())",
    "pendingWebClip = WebClip.fromReader(title, body, readerSourceUrl);",
    "dialog.dismiss();",
    "showPendingWebClip();",
):
    assert marker in reader, f"Reader clip action missing: {marker}"
for marker in (
    "!activityResumed || storageLoading",
    "!isActivityCallbackCurrent()",
    "initial.excerptShortened",
    "initial.sourceTreatment",
    "InputFilter.LengthFilter(WebClip.MAX_TITLE_CHARS)",
    "InputFilter.LengthFilter(TaskLogic.MAX_NOTES_CHARS)",
    "titleInput.setSaveEnabled(false)",
    "noteInput.setSaveEnabled(false)",
    "pendingWebClip.withTitle(",
    "pendingWebClip.withNotes(",
    'setTitle("Possible duplicate task")',
    "if (pendingWebClip == null || !canEdit())",
    "Task task = WebClip.createTask(pendingWebClip);",
    "tasks.add(task);",
    'saveTasksAsync("Saving offline clip…");',
    "setWebMode(false);",
    "HapticFeedbackConstants.CONFIRM",
    "HapticFeedbackConstants.REJECT",
    "Build.VERSION.SDK_INT >= 31 && !highContrast",
):
    assert marker in composer, f"Clip review/save contract missing: {marker}"
for marker in (
    "public Object onRetainNonConfigurationInstance()",
    "return pendingWebClip;",
    "getLastNonConfigurationInstance()",
    "if (retained instanceof WebClip.Draft)",
    "webClipDialog.setOnDismissListener(null);",
):
    assert marker in activity, f"Clip configuration lifecycle missing: {marker}"
saved_state = activity.split("protected void onSaveInstanceState", 1)[1].split(
    "protected void onResume", 1
)[0]
assert "pendingWebClip" not in saved_state, "unsaved clip text must not be written into saved-instance state"
for marker in (
    "BrowserAddress.requireAllowedWebUrl(pageUrl)",
    "checked.indexOf('?')",
    "checked.indexOf('#')",
    "BrowserHistory.sanitizeUrl(clean)",
    "MAX_SOURCE_CHARS",
    "MAX_READER_CHARS",
    "TaskLogic.MAX_NOTES_CHARS",
    "safeEnd(",
    "validUnicode(",
    "Collections.singletonList(TAG)",
):
    assert marker in clip, f"Clip domain/privacy guard missing: {marker}"
for forbidden in ("HttpURLConnection", "HttpsURLConnection", "openConnection(", "loadUrl(", "evaluateJavascript("):
    assert forbidden not in clip and forbidden not in composer, \
        f"Clipping must not initiate network requests or run page scripts: {forbidden}"
assert "showTaskEditor(null, draftTitle, sourceUrl)" in page_task, \
    "the existing page-as-task flow must keep its full URL in notes, not truncate it in the title"
assert 'runPhase("offline-web-clip-store", this::offlineWebClipStoreRoundTrip)' in instrumentation, \
    "platform instrumentation must cover a clip through Android's AtomicFile adapter"
print("PASS offline web clip source checks: review, bounded privacy-safe source, retained draft, encrypted save and no new network")
