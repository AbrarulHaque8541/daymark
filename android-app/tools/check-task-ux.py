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

listing = region("private void renderTaskList(LocalDate today)", "private void renderTaskCount()",
                 "renderTaskList")
check("String selectedTag = powerMode ? activeTag : \"\";" in listing,
      "renderTaskList must read the tag only in the task workspace")
check("TaskLogic.filter(tasks, selectedFilter, selectedQuery, selectedTag, today)" in listing,
      "renderTaskList must pass the tag to the filter")
check("taskListRenderGate.shouldRebuild(selectedFilter, selectedQuery, selectedTag,"
      in listing, "the render gate must key on the tag")
count = region("private void renderTaskCount(LocalDate today)", "private void appendSmartToken",
               "renderTaskCount")
check("String selectedTag = powerMode ? activeTag : \"\";" in count,
      "renderTaskCount must read the tag")
check("boolean narrowed = !selectedQuery.trim().isEmpty() || !selectedTag.isEmpty();" in count,
      "a tag filter must read as narrowing the list")
check("No tasks tagged #\" + selectedTag" in listing, "empty state must name the active tag")

check("boolean shouldRebuild(String filter, String query, String tag, List<Task> visible,"
      in RENDER_GATE, "gate overload with tag missing")
check("shouldRebuild(filter, query, \"\", visible, saveFailed);" in RENDER_GATE,
      "tag-free gate overload must delegate with no tag")
check("private static String fingerprint" in RENDER_GATE, "gate fingerprint missing")
check("sb.append(tag == null ? \"\" : tag).append('|');" in RENDER_GATE,
      "gate fingerprint must include the tag")

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
check("notes.setText(formatNote(task.notes, spans));" in ACTIVITY, "styled note not applied")
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
]:
    check(f"case {action}:" in handled, f"{action} case missing")
    check(wiring in handled, f"{action} must call {wiring}")
check("case KeyShortcuts.CLEAR_SEARCH:" in handled, "Escape case missing")
clear = handled.split("case KeyShortcuts.CLEAR_SEARCH:", 1)[1]
check("activeTag = \"\";" in clear, "Escape must clear the tag as well as the query")

for constant in ("KEY_K", "KEY_F", "KEY_T", "KEY_W", "KEY_R", "KEY_ESCAPE"):
    check(f"static final int {constant} = " in keys, f"{constant} missing")

check('addSettingsRow(content, "Keyboard shortcuts"' in ACTIVITY,
      "shortcuts must be discoverable from Settings")
shortcut_dialog = region("private void showKeyboardShortcutsDialog", "private void addSettingsRow",
                         "keyboard shortcut dialog")
for chord in ("Ctrl + K", "Ctrl + F", "Ctrl + T", "Ctrl + W", "Ctrl + R", "Esc"):
    check(f'{{ "{chord}"' in shortcut_dialog, f"{chord} must be listed in the dialog")
check('row.setContentDescription(shortcut[0] + ". " + shortcut[1]);' in shortcut_dialog,
      "each shortcut row needs an accessible description")

# --- 4. Registration -----------------------------------------------------------------------

for smoke in (NOTE_SMOKE, KEYS_SMOKE, TAG_SMOKE):
    check(smoke.is_file(), f"{smoke.name} missing")
    check(smoke.name in CORE_RUNNER, f"{smoke.name} must run in run-core-tests.sh")
for source in ("NoteFormat.java", "KeyShortcuts.java"):
    check(source in CORE_RUNNER, f"{source} must be compiled by run-core-tests.sh")

print(f"PASS task UX source checks: {checks} assertions")
