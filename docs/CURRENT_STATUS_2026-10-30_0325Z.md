# Daymark status snapshot — 2026-10-30 0325 UTC

Time-sensitive record for the task-page feature batch stacked on the press-feedback branch.
Verified live at `2026-10-30T03:25:36Z`. Durable rules stay in [`AGENTS.md`](../AGENTS.md).

## Live repository state at capture

- `main` head: `05ac4201d7317b827dadaaa801aabf084c78e404` (unchanged since the branch was cut).
- Source version: `versionName=1.5`, `versionCode=12` — still unchanged; no tag was created.
- Open PR #344 (`feat/android-press-feedback-motion-20261029`) was green on head
  `e245aaef32a656ef798dc9fa2c5ee4aaadf22794`: Android CI
  [40957896154](https://github.com/AbrarulHaque8541/daymark/actions/runs/40957896154) passed its
  real Gradle build (`Build and verify debug variants`) and cold-launched the debug APK on API 36
  and API 29; device-test assets and cross-platform contracts also passed. This batch adds
  commits on top of that PR rather than opening a second one, because #344 is the only open PR
  editing the shared `MainActivity.java`.

## What this batch adds

Three gaps documented in [`TASK_BROWSER_PAGE_GAPS.md`](TASK_BROWSER_PAGE_GAPS.md) and
[`OWNER_FEATURE_SUGGESTIONS_2026-10-10.md`](OWNER_FEATURE_SUGGESTIONS_2026-10-10.md):

1. **Tag filter chips.** `TaskLogic.filter(tasks, filter, query, tag, today)` ANDs an exact tag
   with the existing category and free-text filters; the tag-free overload delegates with `""`.
   `TaskLogic.availableTags` returns distinct tags alphabetically, bounded at
   `MAX_TAG_CHIPS = 24`. The task page shows a horizontally scrolling chip row under the search
   field — only in the power layout, never in the browser, never while storage is closed, and
   never when no tag exists. Tapping the selected chip clears it; a tag that no longer exists
   clears itself on the next render. `TaskListRenderGate` now keys on the tag, so the
   skip-identical-rebuild optimization cannot leave a stale list after a chip tap.
2. **Note formatting.** New pure `NoteFormat` recognises single-line `` `inline code` `` and bare
   `https://` links, returning sorted, non-overlapping spans. HTTP is deliberately not
   linkified — the shipped browser is HTTPS-only and would refuse it. Unclosed backticks and
   over-long URLs stay literal. The note dialog renders code in monospace and links in the
   accent color; a tapped link goes back through `BrowserAddress.isAllowedWebUrl` and the
   Offline-consent flow like every other navigation. The note is still never parsed as HTML.
3. **Hardware keyboard shortcuts.** New pure `KeyShortcuts` maps Ctrl+K (quick add), Ctrl+F
   (task search, or find-in-page in the browser), Ctrl+T/Ctrl+W/Ctrl+R (browser only) and Escape
   (clear a narrowing search and tag). Only the first `ACTION_DOWN` of an unmodified Ctrl chord
   is claimed; unmapped keys and Alt/Shift chords reach the system untouched. Settings →
   POWER FEATURES → **Keyboard shortcuts** lists the exact chords the code handles, so the
   feature is discoverable without reading the release notes.

Supporting work: `TaskFilterSmoke` (20 assertions), `NoteFormatSmoke` (45), `KeyShortcutsSmoke`
(23), and `check-task-ux.py` (96 assertions) with five `expect_fail_after_removal` mutations
proving it fails closed.

## Checks actually run

- `sh android-app/tools/check-v1-source.sh` — **PASS**, exit 0, including the new
  `check-task-ux.py` and the existing palette contrast floor `minimum 4.87:1`.
- `sh android-app/tools/run-check-guard-tests.sh` — **PASS**, 27 meta assertions (five new
  fail-closed mutations for `check-task-ux.py`).
- `sh android-app/tools/run-core-tests.sh` — **PASS**; new smokes report
  `PASS task filter smoke: 20 assertions`, `PASS note format smoke: 45 assertions`,
  `PASS key shortcuts smoke: 23 assertions`.
- `npm test` (repository root) — **PASS**, 32/32.
- `javac --release 17` against the real API-36 `android.jar` for `githubSideload` and `play`
  source sets, 73 sources each — **PASS** (exit 0 each).

## Not run / not tested — read before treating any of this as release evidence

- **NOT RUN locally:** Gradle, lint, resource linking, dex, signing or APK assembly. This host is
  arm64 and the installed SDK `aapt2` is an x86-64 ELF. CI is the build gate.
- **NOT TESTED:** every rendered behaviour in this batch — chip wrapping and contrast under the
  real palette, note span rendering, link tap target, and chord handling with a physical
  keyboard. `LinkMovementMethod`, `ClickableSpan` and `TypefaceSpan` are exercised by `javac`
  only; no device or emulator run has touched them.
- **NOT TESTED:** whether the IME consumes Ctrl+K/Ctrl+F before `dispatchKeyEvent` on a real
  hardware keyboard. The mapping is deliberately conservative, but this is an observation that
  needs a device.
- No release action was taken: no tag, no version bump, no publish, no merge. Push rights for this
  cycle remain branch + PR only.

## Reproducible commands

```sh
sh android-app/tools/check-v1-source.sh
sh android-app/tools/run-check-guard-tests.sh
sh android-app/tools/run-core-tests.sh
npm test
```

---
Work by: Qoder (Qoder desktop agent)
Model: not disclosed by runtime
Tooling: Bash, git, GitHub REST API via a local helper (token read from ~/.git-credentials, never printed), OpenJDK 17 javac, Android platform android.jar API 36, Python 3
Timestamp (UTC): 2026-10-30T03:25:36Z
