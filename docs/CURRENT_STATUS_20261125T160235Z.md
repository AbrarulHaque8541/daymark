# Daymark engineering status — 2026-11-25T16:02:35Z

Android UI/UX detailing pass, plus a verified merge audit of the 921 unmerged agent branches.

## Current state (verify live before acting)

- `main` = `05a052c8` ("docs(status): glance success-flash consistency + v1.6 release-failure root cause (#958)").
- App identity/version in source (`android-app/app/build.gradle.kts`): `applicationId`/`namespace` = `com.abrar.daymark`, `versionName` = `1.6`, `versionCode` = `13`, `targetSdk` = 36, `minSdk` = 26.
- Open PRs: **0**. Open issues: **15** (all QA/verification or platform-spike trackers).
- Published release: **v1.5** (2026-10-23). Tag `v1.6` exists at the stale `3c9ad3aa`; **no GitHub Release for v1.6** was ever published.
- Branch under work: `feat/android-ui-detailing-pass-20261125`.

## Merge audit — what actually landed, and what must not be merged again

All 1,086 remote branches were audited at content level (not just by merge-base): for every branch
that is not merged into `main`, each file it changed was compared against `main` by blob, and any
blob that `main` has never held at that path was treated as genuinely unlanded work.

- **165** branches are merged into `main` by merge commit.
- **921** are "not merged" in the git sense. Of those, **593** carry content that is not
  byte-identical in `main`; the remaining 328 are exact or superseded copies.
- Spot-verifying the substantive Android branches shows their work **is already in `main`**:
  `TextScalePolicy`, `BrowserDownloadFailClosedPolicy`, `BrowserDownloadProgress`,
  `BrowserDownloadRedirectPolicy`, `WorkspaceMotion` and `NaturalLanguageTaskParse` all exist on
  `main`. The one apparent gap, `BrowserDownloadTransport.java` (branch
  `feature/redirect-validating-download-transport-20261109`), was superseded by `main`'s split
  design — redirect validation (`BrowserDownloadRedirectPolicy`), a byte-capped body transfer
  (`BrowserDownloadBodyTransfer`) and fail-closed gating (`BrowserDownloadFailClosedPolicy`).
- The older Android branches carry the **retired pre-rename package path**. Merging them would
  reintroduce the namespace that `AGENTS.md` §2.2 forbids and would move the app away from
  `com.abrar.daymark`.
- `integration/consolidate-all-work-20261122` is built on an older base: merging it would delete
  ~340 lines from `index.html` and gut the glance-card test suites. It must not be merged.
- `trae/agent-Kv1j8E` is an unrelated agent's work ("Multilingual Education Platform"). Not Daymark.
- The 446 web-only branches are parallel Cycle A / Cycle B polish passes on the web prototype.
  Several agents produced the same feature (five separate ISS press-feedback branches, four
  spaceflight branches, …); `main` already holds the consolidated result of those cycles.

**Conclusion:** `main` already is the merged result of the agents' work. The branches are
superseded, duplicated, stale, unrelated, or would regress `main`. Nothing was force-merged.

## What changed in this pass (`feat/android-ui-detailing-pass-20261125`)

### Functional defects

1. **Duplicating a task silently discarded its details.** `TaskLogic.create(title, dueDate,
   priority)` was used, so a duplicate lost the note, the due time, the reminder, the checklist,
   the repeat rule and the tags while the UI said "Task duplicated." New
   `TaskLogic.duplicate(Task, String)` copies every field, keeps the monthly/yearly anchor
   verbatim, and deliberately carries no attachments (an attachment's encrypted payload belongs
   to the source task). Covered by new host assertions in `TaskLogicSmoke`.
2. **The browser's back, forward and reload buttons were built, wired and state-synced but never
   added to any container.** The owner's decision (`#222`, pinned by
   `check-bottom-navigation.py`) keeps the compact toolbar to new-tab / tabs / overflow and puts
   the navigation controls in the overflow menu. The implementation had drifted from that: three
   unused button objects were still constructed and their enabled state was still computed for a
   button nobody could see, and the overflow menu's **Back**, **Forward** and **Reload** entries
   swallowed the tap with no feedback whenever there was no history. The dead objects are gone and
   the overflow entries now say what is missing.
3. **The Focus Timer's "SESSION DATA" card was a static placeholder** that nothing ever updated.
   It now reports the session actually on screen.
4. **Pressing "Go" with an empty address bar did nothing and said nothing.** It now explains
   itself and buzzes.

### Working / not-working states

5. **Disabled controls were visually identical to enabled ones.** `pressable()` has no
   `state_disabled`, and only one button in the app dimmed itself. A new `setControlEnabled()`
   helper gives all 30 `setEnabled` call sites one recessive treatment, so a control that cannot
   act no longer looks ready to tap. The Focus Timer panel had four different dim values (0.42 /
   0.45 / 0.55 / 0.58); they are now one.
6. **The task row's reminder chip was a permanently disabled button** styled exactly like the
   tappable Files / Checklist / Note chips. It is now a plain label.
7. **The Focus Timer's mode buttons, custom duration, presets, display units and toggles** now
   dim together with their disabled state, and the preset chips no longer ignore "in flight".

### Alignment and consistency

8. The browser provider switcher now shares its row's radius, text size and height; the "+ Add"
   chip in the provider strip matches its 34dp neighbours instead of standing 48dp tall.
9. The filter row and the tag row are now one chip style (48dp, 12sp, radius 20, press
   background). They used to be 48dp/12sp/radius 20/flat and 44dp/11sp/radius 22/press.
10. The privacy info icon had a 36×30dp tap target; it is now 48×48dp.
11. The editor's two "Clear" buttons are now distinguishable for screen readers, and the task
    row's title and details line share one font-padding rhythm.
12. The quick-date row was 44dp while the date and time rows beside it were 48dp.
13. A two-line subtask title was clipped by a fixed 52dp row; the row now grows.
14. "Cancel" (48dp) and "Save task" (50dp) sat side by side in the web-clip dialog at different
    heights.
15. The saved-site chips hardcoded the **light** theme's accent, so night mode kept a bright teal
    border on a dark surface — the only element on screen not using the dark palette.

### Copy

16. The same feature was called "Power mode" in one place and "Power path" in another; the button
    visibly changed vocabulary after the first toggle. One name now, everywhere.
17. "ranked demo suggestions" referred to a card that was removed in `#225`; it is now "ranked
    task suggestions" (the ranking still ships in the task list).
18. The browser status line was an unlabelled tap target that did nothing, and the privacy icon's
    short label was overwritten by a 700-character description that TalkBack read for one tap.

### Speed and battery

19. **The filter row re-counted all six filters with a separate loop and re-parsed every task's
    due date for every filter** — up to twelve date parses per task per render, on the UI thread,
    and `render()` is called from dozens of places. It is now one pass with one parse per task.
20. The tag row, the suggestion list and the browser search-filter chips were torn down and
    re-inflated on every render. They are rebuilt only when their content actually changes.
21. **Every save and every return to the foreground cancelled and re-created one AlarmManager
    alarm per task with a reminder.** Completing a single task re-armed every alarm in the app.
    The alarms are now re-armed only when the reminder set actually changes. Trade-off: an alarm
    the OS dropped silently is no longer repaired by a resume; the boot receiver still repairs it
    after a reboot.

### Build

22. **The Gradle wrapper cannot bootstrap from this network.** `gradle-wrapper.properties` pins
    `distributionUrl` to a transport mirror *and* pins `distributionSha256Sum` to the official
    Gradle 8.13 SHA-256; `check-v1-source.sh` pins both, and the mirror URL is an owner decision
    that the guard deliberately holds. The mirror's archive downloads **truncated** from this
    environment — repeated resumable fetches stalled at 9 MB, 33 MB and beyond, each time ending
    mid-archive with no central directory — so `./gradlew` aborted with "Verification of Gradle
    distribution failed". The official `services.gradle.org` archive was downloaded whole and
    hashed: it matches the pinned checksum byte-for-byte, so **the pinned configuration is correct
    and the wrapper behaved correctly by refusing an incomplete download**. Nothing was changed
    here. The practical note for the owner: the mirror is unreliable from some networks, and a
    cold `./gradlew` there will fail until the download completes — re-pointing
    `distributionUrl` at `services.gradle.org`, or re-pinning the checksum to the mirror's actual
    payload, would need the guard updated in the same change.
    This branch was built locally with the verified official Gradle 8.13 distribution instead.

## Verification labels

- Host tests: **PASS** — `npm test` 1987/1987 on this head.
- Android host/source checks: **PASS** — `sh android-app/tools/check-v1-source.sh` exit 0 on this
  head, including the updated `check-find-in-page.py`, `check-task-home-copy.py` and
  `check-v1-source.sh` copy pins.
- Local Android build: **PASS** — `assembleGithubSideloadDebug` with the official Gradle 8.13 and
  API 36.
- Android CI: **NOT RUN** for this branch yet.
- Signed-artifact verification: **NOT RUN** — the signed APK/AAB is produced by the production
  release workflow.
- Physical-device / emulator acceptance: **NOT TESTED**.

## Release decision still required (owner)

The v1.6 tag exists at the stale `3c9ad3aa`, so publishing today's `main` needs either a
force-move of `v1.6` (destructive on an existing tag) or a version bump. `AGENTS.md` §6 requires
explicit owner approval for a production tag, and the repository's own status snapshot records
this as an owner decision.

---
Work by: MCode (minimax Code)
Model: MiniMax-M3.1-Flash
Tooling: git, Gradle 8.13, Android SDK API 36, JDK 17, Node 22, python3, curl, GitHub REST API
Timestamp (UTC): 2026-11-25T16:02:35Z
