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
    "if (!setPendingWebClipDraft(WebClip.fromReader(title, body, readerSourceUrl)))",
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
    "if (!setPendingWebClipDraft(null))",
    "if (setPendingWebClipDraft(null))",
    "Could not safely discard this draft. It remains open",
    "Could not safely complete this save. Your draft is still open",
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
    "saveWebClipDraftState(outState, pendingWebClip);",
    "restoreWebClipDraftState(savedInstanceState,",
    "activeWebClipDraftToken(getSharedPreferences(PREFERENCES, MODE_PRIVATE))",
    "setPendingWebClipDraft(WebClip.fromReader(",
    "if (!isChangingConfigurations() && pendingWebClip != null",
    "&& !setPendingWebClipDraft(null))",
):
    assert marker in activity, f"Clip configuration lifecycle missing: {marker}"
saved_state = activity.split("protected void onSaveInstanceState", 1)[1].split(
    "protected void onResume", 1
)[0]
assert "saveWebClipDraftState(outState, pendingWebClip);" in saved_state, \
    "the bounded clip draft must be saved for Activity/process recreation"
save_helper = activity.split("static void saveWebClipDraftState", 1)[1].split(
    "static WebClip.Draft restoreWebClipDraftState", 1
)[0]
restore_helper = activity.split("static WebClip.Draft restoreWebClipDraftState", 1)[1].split(
    "private void setPendingWebClipDraft", 1
)[0]
token_helper = activity.split("private boolean setPendingWebClipDraft", 1)[1].split(
    "protected void onSaveInstanceState", 1
)[0]
token_commit_helper = activity.split("static boolean commitWebClipDraftToken", 1)[1].split(
    "static String activeWebClipDraftToken", 1
)[0]
for marker in (
    "WebClip.restoreDraft(",
    "outState.putString(STATE_WEB_CLIP_DRAFT_TITLE, bounded.title)",
    "outState.putString(STATE_WEB_CLIP_DRAFT_NOTES, bounded.notes)",
    "outState.putBoolean(STATE_WEB_CLIP_DRAFT_SHORTENED, bounded.excerptShortened)",
    "outState.putString(STATE_WEB_CLIP_DRAFT_SOURCE_TREATMENT, bounded.sourceTreatment.name())",
    "outState.putString(STATE_WEB_CLIP_DRAFT_TOKEN, bounded.stateToken)",
):
    assert marker in save_helper, f"Saved clip field missing: {marker}"
assert "WebClip.restoreDraft(" in restore_helper and "activeStateToken.equals(restored.stateToken)" in restore_helper, \
    "restored clip state must pass bounded validation and match the live token"
for marker in (
    "editor.remove(WEB_CLIP_ACTIVE_TOKEN_KEY)",
    "editor.putString(WEB_CLIP_ACTIVE_TOKEN_KEY, stateToken)",
    "editor.commit()",
):
    assert marker in token_commit_helper, f"Draft lifecycle token persistence missing: {marker}"
assert "catch (RuntimeException persistenceFailure)" in token_commit_helper and "return false;" in token_commit_helper, \
    "token-write exceptions must be surfaced as a failed invalidation"
assert "if (!commitWebClipDraftToken(editor, draft == null ? null : draft.stateToken))" in token_helper, \
    "the Activity must preserve its pending draft when token persistence fails"
assert "draft.title" not in token_helper and "draft.notes" not in token_helper, \
    "draft contents must never be written to preferences"
save_clip = activity.split("private void saveWebClip", 1)[1].split("private void openFullScreenWebView", 1)[0]
assert save_clip.index("if (!setPendingWebClipDraft(null))") < save_clip.index("tasks.add(task);"), \
    "task save must not proceed unless stale-snapshot invalidation succeeds"
assert "webClipDialog = dialog;\n                    dialog.show();" in composer, \
    "a failed Back/outside-dismiss invalidation must reopen the still-pending draft"
for forbidden in ("SharedPreferences", "getSharedPreferences(", "FileOutputStream", "Log."):
    assert forbidden not in save_helper, f"Unsaved clip drafts must not persist or log via {forbidden}"
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
assert 'runPhase("offline-web-clip-saved-state", this::offlineWebClipDraftSavedStateRoundTrip)' in instrumentation, \
    "platform instrumentation must cover saved-state parcel/recreation and encrypted task persistence"
assert "a stale snapshot cannot restore after Cancel/Back or Save removes its active token" in instrumentation, \
    "platform instrumentation must guard against draft resurrection after terminal user actions"
for marker in (
    "a false preference commit is reported as failed token invalidation",
    "a throwing preference commit also fails closed without clearing the live token",
    "failed invalidation leaves the active draft intact for the UI to keep open",
):
    assert marker in instrumentation, f"platform instrumentation is missing a token persistence failure case: {marker}"
print("PASS offline web clip source checks: review, bounded privacy-safe source, saved-state restore, encrypted save and no new network")
