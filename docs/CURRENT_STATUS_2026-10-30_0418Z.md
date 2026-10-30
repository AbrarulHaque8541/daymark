# Daymark status snapshot — 2026-10-30 0418 UTC

Time-sensitive record for the searchable-site-history batch stacked on the task-page feature
branch. Captured at `2026-10-30T04:18:15Z`. Durable rules stay in [`AGENTS.md`](../AGENTS.md).
Earlier batches: [`0413 UTC`](CURRENT_STATUS_2026-10-30_0413Z.md) (reminder snooze),
[`0405 UTC`](CURRENT_STATUS_2026-10-30_0405Z.md) (share intake, Ctrl+L), and
[`0325 UTC`](CURRENT_STATUS_2026-10-30_0325Z.md) (tag chips, notes, shortcuts, palette).

## Live repository state at capture

- `main` head: `05ac4201d7317b827dadaaa801aabf084c78e404` — unchanged since the branch was cut.
- Source version: `versionName=1.5`, `versionCode=12` — unchanged; no tag was created.
- PR #344 (`feat/android-press-feedback-motion-20261029`):
  - head `f1ccb5d` (share intake, Ctrl+L) — **all three workflows green**; Android CI built both
    flavors with real Gradle and cold-launched the debug APK on API 36 and API 29.
  - head `0d9c8d2` (reminder snooze) — contract tests and device-test assets green; Android CI
    was still running at capture.
  - The history commit described below is newer than both and needs its own green run.
  - Read the PR checks for the exact head before merging; this file does not stand in for them.

## What this batch adds

**Searchable site history with single-site forget.**

- `BrowserHistory.filter(entries, query)` is a pure, case-insensitive substring match over the
  saved HTTPS origins (blank or null query keeps every entry, null list is empty). Site history
  was previously a flat `setItems` list capped at 50 entries with no way to narrow it.
- `BrowserHistory.remove(serialized, address)` is a pure single-entry removal that keeps the
  remaining order; an unusable or null address returns the history unchanged.
- The dialog now renders a `ListView` with a filter field. Tapping an entry still reopens that
  origin through the existing `navigateBrowserTo` path. Long-pressing an entry asks
  "Forget this site?" and removes just that origin. The message states that cookies and stored
  site data are **not** changed, so the action cannot be mistaken for a privacy wipe; the
  destructive **Clear site history & data** action is unchanged and still visible.
- Placeholder rows ("No recent sites", "No saved sites match this filter") are never treated as
  sites: the click and long-press handlers bound-check against the matched-index list.

## Checks actually run

- `sh android-app/tools/check-v1-source.sh` — **PASS**, exit 0, now including the new
  `check-browser-history.py`.
- `sh android-app/tools/run-check-guard-tests.sh` — **PASS**, exit 0, 35 meta assertions,
  including two new fail-closed mutations (filter call and single-site removal removed from the
  dialog).
- `sh android-app/tools/run-core-tests.sh` — **PASS**, exit 0; `BrowserAddressSmoke` now also
  covers `filter` (blank, whitespace, case-insensitive, port, no-match, null list, null query)
  and `remove` (single entry, order preserved, unusable URL, null URL).
- `npm test` (repository root) — **PASS**, 32/32.
- `javac --release 17` against the real API-36 `android.jar`, both flavor source sets — **PASS**.

## Not run / not tested — read before treating any of this as release evidence

- **NOT RUN locally:** Gradle, lint, resource linking, dex, signing or APK assembly (arm64 host,
  x86-64 `aapt2`). CI is the build gate.
- **NOT TESTED on a device:** the filter field's IME behaviour, long-press discoverability, list
  scrolling with 50 entries, and the forget confirmation flow. The host smoke proves the pure
  helpers only; no device or emulator interaction has exercised the dialog.
- No release action was taken: no tag, no version bump, no publish, no merge. Push rights for
  this cycle remain branch + PR only.

## Reproducible commands

```sh
sh android-app/tools/check-v1-source.sh
sh android-app/tools/check-browser-history.py "$(pwd)/android-app"
sh android-app/tools/run-check-guard-tests.sh
sh android-app/tools/run-core-tests.sh
npm test
```

---
Work by: Qoder (Qoder desktop agent)
Model: not disclosed by runtime
Tooling: Bash, git, GitHub REST API via a local helper (token read from ~/.git-credentials, never printed), OpenJDK 17 javac, Android platform android.jar API 36, Python 3
Timestamp (UTC): 2026-10-30T04:18:15Z
