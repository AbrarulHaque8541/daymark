#!/usr/bin/env python3
"""Source guard for the tag filter, note formatting and hardware keyboard shortcuts.

These are the three "missing" task-page capabilities called out by
docs/TASK_BROWSER_PAGE_GAPS.md and docs/OWNER_FEATURE_SUGGESTIONS_2026-10-10.md. Each one is
easy to regress silently because the failure is invisible without a device, so the guard pins
the contract rather than only the call site:

1. Tag filtering is an exact tag match ANDed with the category filter and the free-text query.
   The render key must include the selected tag, otherwise the cheap "skip identical rebuild"
   gate would leave a stale list on screen after a chip tap.
2. Notes are formatted by NoteFormat only: inline code and bare HTTPS links. HTTP is
   deliberately not linkified, and the formatter must stay pure (no android.* imports) so it is
   host-testable. A tapped link must go through the same BrowserAddress.isAllowedWebUrl gate as
   every other navigation.
3. Keyboard shortcuts live in KeyShortcuts (also pure), are dispatched only for unmodified
   Ctrl chords and Escape, and only touch state the activity owns.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "app/src/main/java/com/abrar/daymark"
ACTIVITY = (MAIN / "MainActivity.java").read_text(encoding="utf-8")
TASK_LOGIC = (MAIN / "TaskLogic.java").read_text(encoding="utf-8")
RENDER_GATE = (MAIN / "TaskListRenderGate.java").read_text(encoding="utf-8")
TASK_MODEL = (MAIN / "Task.java").read_text(encoding="utf-8")
ATTACHMENT_MODEL = (MAIN / "AttachmentRef.java").read_text(encoding="utf-8")
SUBTASK_MODEL = (MAIN / "Subtask.java").read_text(encoding="utf-8")
GATE_SMOKE = (ROOT / "tools/TaskListRenderGateSmoke.java").read_text(encoding="utf-8")
TASK_SEARCH = (MAIN / "TaskSearch.java").read_text(encoding="utf-8")
SEARCH_SMOKE = (ROOT / "tools/TaskSearchSmoke.java").read_text(encoding="utf-8")
NOTE_FORMAT = MAIN / "NoteFormat.java"
KEY_SHORTCUTS = MAIN / "KeyShortcuts.java"
NOTE_SMOKE = ROOT / "tools/NoteFormatSmoke.java"
KEYS_SMOKE = ROOT / "tools/KeyShortcutsSmoke.java"
TAG_SMOKE = ROOT / "tools/TaskFilterSmoke.java"
CORE_RUNNER = (ROOT / "tools/run-core-tests.sh").read_text(encoding="utf-8")
checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


def region_in(source: str, start_marker: str, end_marker: str, label: str) -> str:
    body = source.split(start_marker, 1)
    if len(body) < 2 or end_marker not in body[1]:
        raise AssertionError(f"cannot locate {label} between {start_marker!r} and {end_marker!r}")
    return body[1].split(end_marker, 1)[0]


def region(start_marker: str, end_marker: str, label: str) -> str:
    return region_in(ACTIVITY, start_marker, end_marker, label)


# --- 1. Tag filter -------------------------------------------------------------------------

check("static final int MAX_TAG_CHIPS = 24;" in TASK_LOGIC, "tag chip cap missing")
check("static List<Task> filter(List<Task> tasks, String filter, String query, String tag,"
      in TASK_LOGIC, "tag-aware filter overload missing")
check("return filter(tasks, filter, query, \"\", today);" in TASK_LOGIC,
      "the tag-free overload must delegate with no tag")
check("if (!normalizedTag.isEmpty() && !task.tags.contains(normalizedTag)) continue;" in TASK_LOGIC,
      "tag filter must be an exact tag membership test")
check("static List<String> availableTags(List<Task> tasks)" in TASK_LOGIC,
      "availableTags helper missing")
check("Collections.sort(tags);" in TASK_LOGIC, "chips must be sorted for a stable row")
available = region_in(TASK_LOGIC, "static List<String> availableTags(List<Task> tasks)",
                      "static List<Suggestion>", "availableTags")
check("task != null && task.tags != null" in available, "availableTags must tolerate null tasks")
check("MAX_TAG_CHIPS" in available, "availableTags must respect the chip cap")

check("private String activeTag = \"\";" in ACTIVITY, "activeTag field missing")
check("private HorizontalScrollView tagFilterScroll;" in ACTIVITY, "tag chip scroller missing")
check("private LinearLayout tagFilterRow;" in ACTIVITY, "tag chip row missing")
check("tagFilterScroll = new HorizontalScrollView(this);" in ACTIVITY, "tag chip scroller not built")
check("content.addView(tagFilterScroll, bottomMargin(dp(9)));" in ACTIVITY,
      "tag chip row not attached under the search field")
render = region("private void render()", "private void setTaskChromeHidden", "render()")
check("renderTagFilters();" in render, "render() must refresh the tag chips")
chips = region("private void renderTagFilters()", "private Button tagChip", "renderTagFilters")
check("boolean show = powerMode && !webMode && !storageLoading && !storageLoadFailed"
      in chips, "chips must hide in the compact layout, the browser and while storage is closed")
check("if (!activeTag.isEmpty() && !tags.contains(activeTag)) activeTag = \"\";" in chips,
      "a tag that no longer exists must clear itself")
check("activeTag = selected ? \"\" : tag;" in chips, "tapping the selected chip must clear it")
chip = region("private Button tagChip", "private List<String> parseEditorTags", "tagChip")
check("chip.setText(\"#\" + tag);" in chip, "chip label must show the tag")
check("chip.setContentDescription(" in chip, "chip needs an accessible description")
check("\"Tag \" + tag + \", selected." in chip, "selected chip must announce its state")

listing = region("private int renderTaskList(LocalDate today)", "private void renderTaskCount(int visible)",
                 "renderTaskList")
check("String selectedTag = powerMode ? activeTag : \"\";" in listing,
      "renderTaskList must read the tag only in the task workspace")
check("TaskLogic.filter(tasks, selectedFilter, selectedQuery, selectedTag, today)" in listing,
      "renderTaskList must pass the tag to the filter")
check("taskListRenderGate.shouldRebuild(selectedFilter, selectedQuery, selectedTag,"
      in listing, "the render gate must key on the tag")
count = region("private void renderTaskCount(int visible)", "private void appendSmartToken",
               "renderTaskCount")
check("String selectedTag = powerMode ? activeTag : \"\";" in count,
      "renderTaskCount must read the tag")
check("boolean narrowed = !selectedQuery.trim().isEmpty() || !selectedTag.isEmpty();" in count,
      "a tag filter must read as narrowing the list")
check("No tasks tagged #\" + selectedTag" in listing, "empty state must name the active tag")
check(listing.count("TaskLogic.filter(tasks, selectedFilter, selectedQuery, selectedTag, today)") == 1,
      "one filter pass must supply the task list")
check(listing.count("return visible.size();") == 2,
      "both rebuilt and reused lists must return the visible count")
check("TaskLogic.filter(" not in count and "visible + (visible == 1" in count,
      "the count label must reuse the list result instead of filtering again")
check("renderTaskCount(renderTaskList(today));" in render,
      "a full render must pass the list's count directly to its label")
search_controls = region("searchInput = new EditText(this);", "taskList = new LinearLayout(this);",
                         "task search controls")
check('searchInput.setContentDescription("Search tasks by title, notes, tags, priority or due date")'
      in search_controls, "search accessibility text must name the supported fields")
for marker in ("searchInput.setMinHeight(dp(48))", "searchInput.setMinimumHeight(dp(48))",
               "searchClear.setMinimumHeight(dp(48))", "ViewGroup.LayoutParams.WRAP_CONTENT"):
    check(marker in search_controls, f"search controls must fit scaled text and 48 dp targets: {marker}")
clear_action = search_controls.split("searchClear.setOnClickListener", 1)[1].split(
    "searchRow.addView(searchClear", 1)[0]
check(clear_action.index('searchInput.setText(\"\");')
      < clear_action.index("mainHandler.removeCallbacks(searchDebounceRunnable);"),
      "clearing text must cancel the debounce scheduled by its TextWatcher")
check("searchDebounceRunnable = null;" in clear_action
      and "renderTaskCount(renderTaskList());" in clear_action,
      "clearing must update list and count once without leaving a pending callback")
check(search_controls.count("renderTaskCount(renderTaskList());") == 2,
      "clear and debounced typing must each reuse the list result count")

check("boolean shouldRebuild(String filter, String query, String tag, List<Task> visible,"
      in RENDER_GATE, "gate overload with tag missing")
check("shouldRebuild(filter, query, \"\", visible, saveFailed);" in RENDER_GATE,
      "tag-free gate overload must delegate with no tag")
check("lastTag.equals(nextTag)" in RENDER_GATE,
      "gate must compare the selected tag independently")
check("sameTasksByIdentity(lastVisible, visible)" in RENDER_GATE,
      "gate must compare the task snapshots captured by row callbacks")
check("if (task != iterator.next()) return false;" in RENDER_GATE,
      "a new immutable task instance must refresh its row, even with the same timestamp")
check("new ArrayList<>(visible)" in RENDER_GATE,
      "gate must copy task references rather than retain a mutable list")
for field in ("id", "title", "dueDate", "priority", "createdAt", "updatedAt", "notes",
              "dueTime", "reminderShownFire", "repeatRule"):
    check(f"final String {field};" in TASK_MODEL, f"Task.{field} must be immutable for the render gate")
for marker in ("final boolean completed;", "final Integer reminderLeadMinutes;",
               "final Integer repeatDayOfMonth;", "final List<AttachmentRef> attachments;",
               "final List<Subtask> subtasks;", "final List<String> tags;",
               "Collections.unmodifiableList(new ArrayList<>(attachments))",
               "Collections.unmodifiableList(new ArrayList<>(subtasks))",
               "Collections.unmodifiableList(new ArrayList<>(tags))"):
    check(marker in TASK_MODEL, f"render gate relies on immutable task data: {marker}")
for model, markers in ((ATTACHMENT_MODEL, ("final class AttachmentRef", "final String id;",
                                            "final String displayName;", "final String mimeType;",
                                            "final long sizeBytes;")),
                       (SUBTASK_MODEL, ("final class Subtask", "final String id;",
                                        "final String title;", "final boolean done;"))):
    for marker in markers:
        check(marker in model, f"render gate relies on immutable nested task data: {marker}")
for marker in ("detectsAttachmentChangesWithoutTimestampChanges()",
               "imported attachment must refresh the row and its captured task",
               "completion of the refreshed row retains the imported attachment",
               "snapshotsTheListRatherThanRetainingAMutableContainer()"):
    check(marker in GATE_SMOKE, f"render-gate regression coverage missing: {marker}")
check('"$ROOT/tools/TaskListRenderGateSmoke.java"' in CORE_RUNNER
      and "com.abrar.daymark.TaskListRenderGateSmoke" in CORE_RUNNER,
      "render-gate regression test must be compiled and run")

# Search stays local and retains literal behavior before bounded fuzzy fallback.
filter_body = region_in(TASK_LOGIC, "static List<Task> filter(List<Task> tasks, String filter, String query, String tag,",
                        "static List<String> availableTags", "tag-aware task filter")
check("TaskSearch.prepare(query)" in filter_body and "if (!search.matches(task)) continue;" in filter_body,
      "the existing list/filter flow must use local search")
for marker in ("Locale.ROOT", "searchable.contains(literal)", "searchable.contains(term.text)",
               "MAX_FUZZY_QUERY_CHARS = 160", "MAX_FUZZY_TERMS = 6",
               "MIN_FUZZY_TERM_CODE_POINTS = 4", "MAX_FUZZY_TERM_CODE_POINTS = 32",
               "withinOneEdit(", "Character.isLetterOrDigit("):
    check(marker in TASK_SEARCH, f"bounded local search contract missing: {marker}")
for forbidden in ("import android.", "openConnection(", "loadUrl(", "HttpURLConnection"):
    check(forbidden not in TASK_SEARCH, f"task search must not need Android or a network request: {forbidden}")
for marker in ("preservesExistingSearch()", "matchesCommonTyposAndMultipleTerms()",
               "keepsCategoryAndTagFiltersExact()", "handlesUnicodeAndBoundsConservatively()",
               "matchesReferenceOneEditPolicy()"):
    check(marker in SEARCH_SMOKE, f"search behavior coverage missing: {marker}")
check('"$ROOT/tools/TaskSearchSmoke.java"' in CORE_RUNNER
      and "com.abrar.daymark.TaskSearchSmoke" in CORE_RUNNER,
      "search regression test must be compiled and run")

# --- 2. Note formatting --------------------------------------------------------------------

check(NOTE_FORMAT.is_file(), "NoteFormat.java missing")
note = NOTE_FORMAT.read_text(encoding="utf-8")
check("import android." not in note, "NoteFormat must stay pure for host tests")
check("static final int MAX_LINK_CHARS = 2048;" in note, "link length cap missing")
check("static List<Span> spans(String text)" in note, "spans() entry point missing")
check("enum Kind { CODE, LINK }" in note, "span kinds missing")
check("\"https://\"" in note, "only HTTPS is linkified")
check("http://" in note, "the note must document why HTTP is not linkified")
check("private static boolean isSchemeStart(" in note, "token-boundary check missing")
check("private static boolean hasHost(" in note, "host validation missing")
check("isTrailingPunctuation" in note, "trailing punctuation trimming missing")

check("List<NoteFormat.Span> spans = NoteFormat.spans(task.notes);" in ACTIVITY,
      "the note dialog must format through NoteFormat")
check("notes.setText(formatNote(task.notes, spans," in ACTIVITY, "styled note not applied")
check("if (holder[0] != null) holder[0].dismiss();" in ACTIVITY,
      "a tapped note link must close the dialog before navigating behind it")
check("notes.setMovementMethod(LinkMovementMethod.getInstance());" in ACTIVITY,
      "links need a movement method to be tappable")
check("new TypefaceSpan(\"monospace\")" in ACTIVITY, "inline code must render in monospace")
check("paint.setColor(palette.accent);" in ACTIVITY, "link color must come from the palette")
note_link = region("private void openNoteLink(String url)", "private void showAttachmentManager",
                   "openNoteLink")
check("BrowserAddress.isAllowedWebUrl(url)" in note_link,
      "note links must pass the HTTPS gate before navigating")
check("confirmBrowserOnlineAccess(() -> loadBrowserAddress(url));" in note_link,
      "note links must respect the Offline default")

# --- 3. Keyboard shortcuts -----------------------------------------------------------------

check(KEY_SHORTCUTS.is_file(), "KeyShortcuts.java missing")
keys = KEY_SHORTCUTS.read_text(encoding="utf-8")
check("import android." not in keys, "KeyShortcuts must stay pure for host tests")
check("static final int KEY_ESCAPE = 111;" in keys, "escaped key constant missing")
check("if (!ctrl || alt || shift) return NONE;" in keys,
      "only plain Ctrl chords may be claimed")
check("return webMode ? FIND_IN_PAGE : SEARCH;" in keys, "Ctrl+F must follow the workspace")
check("return webMode ? ADDRESS_BAR : SEARCH;" in keys, "Ctrl+L must follow the workspace")
check("return webMode ? NEW_TAB : NONE;" in keys, "Ctrl+T is browser-only")
check("return webMode ? CLOSE_TAB : NONE;" in keys, "Ctrl+W is browser-only")
check("return webMode ? RELOAD_PAGE : NONE;" in keys, "Ctrl+R is browser-only")

check("public boolean dispatchKeyEvent(KeyEvent event)" in ACTIVITY, "dispatchKeyEvent missing")
dispatch = region("public boolean dispatchKeyEvent(KeyEvent event)", "private boolean handleShortcut",
                  "dispatchKeyEvent")
check("event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0" in dispatch,
      "only the first ACTION_DOWN of a chord may fire")
check("KeyShortcuts.actionFor(event.getKeyCode(), event.isCtrlPressed()," in dispatch,
      "the activity must resolve chords through KeyShortcuts")
check("return super.dispatchKeyEvent(event);" in dispatch, "unmapped keys must reach the system")
handled = region("private boolean handleShortcut(int shortcut)", "private void registerDaymarkBackCallback",
                 "handleShortcut")
for action, wiring in [
    ("KeyShortcuts.QUICK_ADD", "quickCaptureInput.requestFocus();"),
    ("KeyShortcuts.SEARCH", "searchInput.requestFocus();"),
    ("KeyShortcuts.FIND_IN_PAGE", "showFindInPageDialog();"),
    ("KeyShortcuts.NEW_TAB", "requestNewBrowserTab();"),
    ("KeyShortcuts.CLOSE_TAB", "closeCurrentBrowserTab();"),
    ("KeyShortcuts.RELOAD_PAGE", "browserWebView.reload();"),
    ("KeyShortcuts.ADDRESS_BAR", "browserAddressInput.requestFocus();"),
]:
    check(f"case {action}:" in handled, f"{action} case missing")
    check(wiring in handled, f"{action} must call {wiring}")
check("case KeyShortcuts.CLEAR_SEARCH:" in handled, "Escape case missing")
clear = handled.split("case KeyShortcuts.CLEAR_SEARCH:", 1)[1]
check("activeTag = \"\";" in clear, "Escape must clear the tag as well as the query")
check("render();" in clear, "Escape must repaint the chips, not only the list")
check("searchQuery.isEmpty() && activeTag.isEmpty()" in clear,
      "Escape must still fire when only a tag narrows the list")

for constant in ("KEY_K", "KEY_F", "KEY_L", "KEY_T", "KEY_W", "KEY_R", "KEY_ESCAPE"):
    check(f"static final int {constant} = " in keys, f"{constant} missing")

check('addSettingsRow(content, "Keyboard shortcuts"' in ACTIVITY,
      "shortcuts must be discoverable from Settings")
shortcut_dialog = region("private void showKeyboardShortcutsDialog", "private void addSettingsRow",
                         "keyboard shortcut dialog")
for chord in ("Ctrl + Shift + P", "Ctrl + K", "Ctrl + F", "Ctrl + L", "Ctrl + T", "Ctrl + W",
              "Ctrl + R", "Esc"):
    check(f'{{ "{chord}"' in shortcut_dialog, f"{chord} must be listed in the dialog")
check('row.setContentDescription(shortcut[0] + ". " + shortcut[1]);' in shortcut_dialog,
      "each shortcut row needs an accessible description")

# --- 3b. Command palette -------------------------------------------------------------------

PALETTE = MAIN / "CommandPalette.java"
PALETTE_SMOKE = ROOT / "tools/CommandPaletteSmoke.java"
check(PALETTE.is_file(), "CommandPalette.java missing")
palette = PALETTE.read_text(encoding="utf-8")
check("import android." not in palette, "CommandPalette must stay pure for host tests")
check("static final int MAX_RESULTS = 6;" in palette, "palette result cap missing")
check("static List<Task> matchingTasks(List<Task> tasks, String query, int limit)" in palette,
      "matchingTasks entry point missing")
check("if (title.startsWith(normalizedQuery)) return 0;" in palette, "prefix ranking missing")
check("if (title.contains(normalizedQuery)) return 1;" in palette, "substring ranking missing")
check("return body.contains(normalizedQuery) ? 2 : -1;" in palette,
      "notes/tag ranking missing")
check("if (limit >= 0 && ranked.size() > limit)" in palette, "limit must be optional")
check("static final int COMMAND_PALETTE = 8;" in keys, "COMMAND_PALETTE constant missing")
check("return keyCode == KEY_P ? COMMAND_PALETTE : NONE;" in keys,
      "Ctrl+Shift+P must map to the palette")
check("case KeyShortcuts.COMMAND_PALETTE:" in handled, "palette case missing in handleShortcut")
check("showCommandPalette();" in handled, "palette case must open the dialog")
palette_ui = region("private void showCommandPalette", "private void showKeyboardShortcutsDialog",
                    "showCommandPalette")
check("CommandPalette.matchingTasks(tasks, query," in palette_ui,
      "the palette must rank through CommandPalette")
check("CommandPalette.MAX_RESULTS" in palette_ui, "the palette must use the shared cap")
check('addSettingsRow(results, "New task"' in palette_ui, "palette must offer New task")
check('addSettingsRow(results, "Open settings"' in palette_ui, "palette must offer Settings")
check('addSettingsRow(results, "Open browser"' in palette_ui, "palette must offer the browser")
check("if (query.trim().isEmpty()) {" in palette_ui,
      "fixed commands must only appear on an empty query")
check("input.requestFocus();" in palette_ui, "the palette must focus its field")
check("if (holder[0] != null) holder[0].dismiss();" in palette_ui,
      "a chosen command must close the palette first")
check(PALETTE_SMOKE.is_file(), "CommandPaletteSmoke.java missing")
check(PALETTE_SMOKE.name in CORE_RUNNER, "CommandPaletteSmoke must run in run-core-tests.sh")
check("CommandPalette.java" in CORE_RUNNER, "CommandPalette.java must be compiled by run-core-tests.sh")

# --- 3c. Share intake -----------------------------------------------------------------------

SHARE_INTAKE = MAIN / "ShareIntake.java"
SHARE_SMOKE = ROOT / "tools/ShareIntakeSmoke.java"
check(SHARE_INTAKE.is_file(), "ShareIntake.java missing")
share = SHARE_INTAKE.read_text(encoding="utf-8")
check("import android." not in share, "ShareIntake must stay pure for host tests")
check("static final int MAX_QUICK_ADD = 2048;" in share,
      "the quick-add bound must match the field's length filter")
check("static final int MAX_TITLE = 160;" in share,
      "the title bound must match the editor's length filter")
check("if (singleLine && body.length() <= MAX_QUICK_ADD && !linkWithSubject)" in share,
      "single short lines must keep going to the natural-language quick add")
check("notes.length() > TaskLogic.MAX_NOTES_CHARS" in share,
      "shared notes must respect the editor's notes limit")

share_intent = region("private void handleShareInIntent", "private void showTaskEditor(Task editing)",
                      "handleShareInIntent")
for fragment in ("Intent.ACTION_SEND.equals(intent.getAction())",
                 "Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())",
                 "intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)",
                 "ShareIntake.parse(",
                 "intent.removeExtra(Intent.EXTRA_TEXT);",
                 "intent.removeExtra(Intent.EXTRA_SUBJECT);",
                 "showTaskEditor(null, draft.title, draft.notes);",
                 "quickCaptureInput.setSelection(Math.min(draft.title.length(), "
                 "ShareIntake.MAX_QUICK_ADD));"):
    check(fragment in share_intent, f"share intake must contain {fragment}")
check("text.substring(0, 2048)" not in share_intent,
      "the intake must not silently truncate shared text")

manifest = (ROOT / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
check('android:name="android.intent.action.PROCESS_TEXT"' in manifest,
      "selected text cannot reach Daymark without a PROCESS_TEXT filter")
check('android:name="android.intent.action.SEND"' in manifest, "share target filter missing")
check("notesInput.setText(draftNotes);" in ACTIVITY, "the editor must prefill notes from a share")
check(SHARE_SMOKE.is_file(), "ShareIntakeSmoke.java missing")
check(SHARE_SMOKE.name in CORE_RUNNER, "ShareIntakeSmoke must run in run-core-tests.sh")
check("ShareIntake.java" in CORE_RUNNER, "ShareIntake.java must be compiled by run-core-tests.sh")

# --- 4. Registration -----------------------------------------------------------------------

for smoke in (NOTE_SMOKE, KEYS_SMOKE, TAG_SMOKE):
    check(smoke.is_file(), f"{smoke.name} missing")
    check(smoke.name in CORE_RUNNER, f"{smoke.name} must run in run-core-tests.sh")
for source in ("NoteFormat.java", "KeyShortcuts.java", "ShareIntake.java"):
    check(source in CORE_RUNNER, f"{source} must be compiled by run-core-tests.sh")

print(f"PASS task UX source checks: {checks} assertions")
