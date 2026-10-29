# Daymark status snapshot — 2026-10-29 2024 UTC

Time-sensitive record for the Android press-feedback / motion branch. Verified live at
`2026-10-29T20:24:11Z`. Durable rules stay in [`AGENTS.md`](../AGENTS.md).

## Live repository state at capture

- `main` head: `05ac4201d7317b827dadaaa801aabf084c78e404` (merge of PR #339).
- Source version: `versionName=1.5`, `versionCode=12` — unchanged by this branch.
- Published latest release: **v1.5** (published `2026-10-23`); the older **v1.4** release still
  exists as an unpublished draft. No v1.6 exists.
- PRs #338, #342 and #339 were merged in the 2026-10-29 cycle before this branch was cut, so no
  open PR overlaps `MainActivity.java`:
  - #343 `web/prototype-ux-20261029` — web prototype + docs only.
  - #341 `docs/refresh-android-release-status-20261026` — docs only.
  - #333 (draft) — reminder/attachment/CI files, no `MainActivity.java`.

## This branch

- Branch `feat/android-press-feedback-motion-20261029`, based on `05ac4201` (no rebase needed;
  `main` had not moved at capture). Commits: `89117023` the feature, `9605f9e` measurement-prose
  corrections, `5842f7a` + this file for status docs, `9d8f43e` the `SwipeTaskRow` pressed-state
  fix. Check the PR for the exact current head and its CI, because this file cannot name a SHA that
  has not been pushed yet.
- Scope, per the owner's selection: **motion + press feedback only**. No touch-target/a11y
  rework, no component dedup, no new features, no version bump, no tag.
- Behaviour added:
  - `PressSurface` — pure, Android-free contrast clamp. A pressed fill may never drop its own
    label below 4.5:1; a surface with no headroom keeps its exact fill and is distinguished by the
    accent border instead.
  - `pressable(...)` — pressed + focused `StateListDrawable` for task rows, settings rows,
    primary/plain/compact buttons and all three browser chrome button sites. `state_selected` is
    deliberately excluded.
  - `haptic(...)` / `hapticToggle(...)` — CONFIRM/REJECT/TOGGLE_ON/TOGGLE_OFF behind
    `Build.VERSION.SDK_INT >= 29`, `LONG_PRESS` fallback for API 26–28. Wired only to quick-add
    accept/refusal, completion toggle, swipe accept and swipe-refusal while the store is
    unavailable, delete, and undo-restore.
  - `MOTION_ENTER` / `MOTION_EXIT` interpolators on the browser-chrome, brand-label, composer and
    workspace-switch animators. No animator-scale handling was added: the framework already scales
    `ViewPropertyAnimator`, and reading `Settings.Global.ANIMATOR_DURATION_SCALE` here would
    double-apply it.
  - `SwipeTaskRow.onTouchEvent` now drives `setPressed(...)` itself. That override returns `true`
    for every action and never calls `super`, so `STATE_PRESSED` was never set and the row's new
    press background would have been dead under a finger while working for focus. Found by reading
    the gesture code after the first commit, not by a device test.

## Checks actually run

Run on `89117023` and re-run on the `9605f9e` tree (docs-only delta, no behaviour change) — the
guard suite reported 106 `PASS` lines and exit 0 on the re-run.

- `sh android-app/tools/check-v1-source.sh` — **PASS** (whole suite, exit 0, 106 `PASS` lines,
  including `check-press-feedback.py` 60 assertions, `bottom navigation` 29 assertions, and
  `palette contrast … minimum 4.87:1`).
- `sh android-app/tools/run-check-guard-tests.sh` — **PASS**, including six new
  `expect_fail_after_removal` mutations proving `check-press-feedback.py` fails closed.
- `sh android-app/tools/run-core-tests.sh` — **PASS**; `PressSurfaceSmoke` reports
  `PASS press surface smoke (28 palette pairs)`.
- `npm test` (repository root) — **PASS**, 32/32.
- `javac --release 17` typecheck of all 71 sources against the real API-36 `android.jar`, for both
  `githubSideload` and `play` flavor source sets — **PASS** (exit 0 each).

## Not run / not tested — read before treating any of this as release evidence

- **NOT RUN locally:** `./gradlew assembleDebug`, lint, and any APK/AAB build — this host is arm64
  and the installed SDK `aapt2` is an x86-64 ELF, so resource linking cannot execute here. The
  `javac` gate above proves source and flavor compilation only; it does not prove resources link,
  dex output, signing, or installability. CI (below) is what actually builds them.
- **NOT RUN:** physical-device behaviour. That remains the owner's gate (issue #160).
- CI on `5842f7a88c9f1164e33ba12f2740d0ac46a18e96` — **PASS**, all three `pull_request` runs:
  [Android CI](https://github.com/AbrarulHaque8541/daymark/actions/runs/40951061163) (the real
  Gradle + `aapt2` build this host cannot run),
  [Cross-platform contract tests](https://github.com/AbrarulHaque8541/daymark/actions/runs/40951061123),
  [Android device-test release assets](https://github.com/AbrarulHaque8541/daymark/actions/runs/40951061132).
  The `setPressed` fix landed after that head, so a green run here does **not** cover the newer
  head: re-read the checks on the exact PR head before merging.
- **NOT TESTED:** physical device. Press tint visibility, accent-border readability, haptic
  strength and the eased chrome motion are all rendered-behaviour claims; none was observed on a
  phone, and the emulator cold-launch gates in the release workflow do not cover them. The owner
  device matrix in issue #160 remains open.
- **NOT TESTED:** TalkBack/keyboard-navigation behaviour of the shared pressed+focused state.
- No release action was taken: no `v1.6` tag, no `versionCode` bump, no publish. Agent push rights
  for this cycle are branch + PR only, so merging this PR and cutting any tag require a fresh owner
  decision.

## Reproducible commands

```sh
sh android-app/tools/check-v1-source.sh
sh android-app/tools/run-core-tests.sh
npm test
```

---
Work by: Qoder (Qoder desktop agent)
Model: not disclosed by runtime
Tooling: Bash, git, GitHub REST API via a local helper (token read from ~/.git-credentials, never printed), OpenJDK 17 javac, Android platform android.jar API 36, Python 3
Timestamp (UTC): 2026-10-29T20:24:11Z
