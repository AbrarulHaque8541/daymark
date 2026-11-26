# Daymark engineering status — 2026-11-25T17:01:47Z

Notification-panel detailing, the v1.7 release attempt, and the review of the other agents' open
pull requests. Follows [the UI/UX detailing snapshot](CURRENT_STATUS_20261125T160235Z.md).

## Current state (verify live before acting)

- `main` = `4c4c1eb0` ("feat(android): UI/UX detailing pass — working states, alignment, speed and
  battery (#959)"), the squash merge of the UI/UX detailing pass.
- App identity/version in source (`android-app/app/build.gradle.kts`): `applicationId`/`namespace` =
  `com.abrar.daymark`, `versionName` = `1.8`, `versionCode` = `15`, `targetSdk` = 36, `minSdk` = 26.
- Published release: **v1.5** (2026-10-23). Tag `v1.7` exists at `e2d99cf0` → `4c4c1eb0`;
  **no GitHub Release for v1.7 exists**, and no release exists for v1.6 either. The release this
  branch produces is **v1.8**: `versionCode` stays monotonic and no existing tag is moved, which is
  the repository's own recorded preference over force-moving `v1.6`/`v1.7`.
- Open PRs: **#960** (empty-state "Clear filters"), **#961** (web focus-session readout),
  **#962** (browser tools sheet).
- Branch under work: `feat/android-notification-detailing-20261125`.

## The v1.7 release attempt

- Production run `45655603543` built and verified the **signed APK and AAB** (identity gate,
  signer pin `ad6be60bd89c076c2d3985ec20c30533dd9ff10e07418d64ad1d825418030580`, API 29 and
  API 36 cold-launch gates all PASSED) and then failed at the very last step:
  **"Could not query existing releases (exit 4)"**.
- Root cause: `fetch_release_by_tag()` ends with
  `jq -e '[.[] | select(.tag_name == $tag)][0] // empty'`. `jq -e` exits **4** when the expression
  produced no result at all, which is exactly the "no release carries this tag" case. The function
  documents that it returns **1** for "not found", and the caller treats only 1 as "not found", so
  the `gh release create --draft --verify-tag` branch was **unreachable** — no first release could
  ever be created. The bug has existed since `37a2895d`; v1.4's draft was created outside this path.
- The fix maps jq's status explicitly (`0` → found, `4` → not found/reported as 1, anything else →
  a genuinely failed query/reported as 2) and keeps the duplicate-tag guard, the draft-only policy
  and every other gate untouched. The three paths were exercised directly and `bash -n` is clean.

**Blocked from landing in this environment:** the available token is a classic PAT whose scopes do
**not** include `workflow`, so GitHub refuses any push that touches
`.github/workflows/android-production-release.yml`:

> refusing to allow a Personal Access Token to create or update workflow
> `.github/workflows/android-production-release.yml` without `workflow` scope

The fix is prepared as commit `1550fb90` on branch `fix/production-release-draft-lookup`, but it
**cannot be pushed from here**; it needs a token with the `workflow` scope (or an owner push).
The same token restriction is why the `rerun-failed` Actions endpoint is unavailable.

### How the release will still be produced, with every gate intact

The workflow already supports updating an existing draft release: when a draft for the tag exists,
it uploads the signed APK, writes the release notes (including the `<!-- daymark-updater-v1 -->`
updater metadata), and then runs `verify_draft_release`, which re-checks the title, the draft
flag, the body metadata, the asset name, the asset digest, the asset size and the downloaded
APK's SHA-256. `gh release download` was verified to resolve draft releases, so that path works.
So the release is produced by creating the **empty draft** for `v1.8` through the API first and
letting the production workflow fill, verify and sign it. The build, the signer gate, the
API 29/36 device gates and the asset verification all still run in the workflow; only the creation
of the empty release object is done ahead of time instead of by the broken `gh release create`
call.

## Review of the other agents' open pull requests

Reviewed on UX merit, as asked — not rejected because other agents were also working.

- **#960 (adopted).** An empty-state **"Clear filters"** button with a content description and a
  haptic, shown only when a search, tag or non-default filter is active, which resets them and
  re-renders. It removes a dead end: without it, a filtered-to-nothing task list offered no way
  back. It touches `MainActivity.java`, so it was landed **before** this notification change, as
  `AGENTS.md` §5 requires one focused `MainActivity` change at a time.
  Its "Focus runtime API 36" check failed once with *"resuming after task switch publishes task B's
  notification (published=true, observed=missing)"*. That assertion has failed intermittently on
  unrelated branches (runs 700, 702, 703, 704, 713) and passed on the same source in run 714, so it
  is an emulator timing flake, not a regression from the change. The check was re-run on the same
  tree.
- **#961 (web only).** A focus-session data readout for the web prototype. It does not touch the
  Android app and does not conflict with `MainActivity.java`; it can land independently.
- **#962 (not adopted as shipped).** It adds `BrowserToolsSheetLabels.java` and a guard, but the
  `MainActivity.java` change is only an **unapplied `.diff` patch file**, so merging it would add
  dead code that no build compiles. The idea — a grouped browser tools sheet — is worth doing as a
  real change, not as a patch file in the repository.

## Notification-panel detailing (this branch)

24. **A reminder notification opened the generic home screen, not the task it belonged to.**
    The content intent carried no task identity at all. The notification now carries the task ID
    and opens **that exact task** in the editor. The intent is routed like the other shade
    actions: it is deferred until the encrypted store has loaded, so a cold start from the
    notification still opens the right task instead of an empty editor.
25. **The notification said nothing about *which* task was due.** It now has a subtext with the
    due day (`Due today`, `Overdue Nov 3`, `Due Nov 5`), the due time when the task has one, and
    the priority — the three facts that decide whether you act now or later.
26. **A private notification with no public version renders as an empty row on a locked screen.**
    Both the reminder and the focus-session notification now carry a neutral public version
    ("Task reminder" / "Focus session"), so the locked screen shows a readable row without
    exposing the task title.
27. **The snooze copy could drift from the snooze buttons.** The text hardcoded "5, 10 or 30 min"
    while the buttons are built from `ReminderSchedulePolicy.snoozePresetsMinutes()`. The copy is
    now generated from the same policy, so it can never advertise a snooze the app does not offer.
28. **The reminder channel had no description**, so Android's system settings showed a bare
    "Task reminders" row. It now explains what the channel does.
29. **The app promised a system notification it might not be able to deliver.** The task editor
    said "Daymark schedules a best-effort Android notification for this reminder" even when the
    user had denied `POST_NOTIFICATIONS` or switched notifications off. The editor now states the
    live situation and offers **Settings → Reminder notifications → Open notification settings**.
30. **There was no way to check that reminders actually arrive.** **Settings → Notifications → Send
    a test notification** posts one sample reminder through the user's own channel and sound. It
    never touches a task or an alarm.

Guards were updated in the same change and are **stricter, not weaker**:
`check-reminder-lifecycle.py` now pins the task-routing action, the subtext, the public version,
the policy-derived snooze copy, the channel description, the notification-state helpers and the
Settings entries, and it explicitly forbids the old hardcoded snooze strings;
`check-focus-timer-notification.py` pins the focus notification's public version. Both new pins
have a matching removal test in `run-check-guard-tests.sh`, so the guards are proven to fail when
the wiring is removed.

## Verification labels

- Host tests: **PASS** — `npm test` 1987/1987 on this head.
- Android host/source checks: **PASS** — `sh android-app/tools/check-v1-source.sh` exit 0 on this
  head, including the updated notification guards.
- Local Android build: **PASS** — `assembleGithubSideloadDebug` with the verified official Gradle
  8.13 and API 36.
- Android CI: **NOT RUN** for this branch yet.
- Signed-artifact verification: **PASS for the previous head** — run `45655603543` produced a signed
  APK (`Daymark-v1.7-githubSideload.apk`, SHA-256
  `084e31b5704d44d68bc53cc7266f58ac607f85e3259117287bc2ff90d9636ed8`, 1 488 778 bytes) and a signed
  AAB. The release for this head will be re-verified by the production workflow.
- Physical-device / emulator acceptance: **NOT TESTED**.

## Release decision

`AGENTS.md` §6 requires explicit owner approval for a production tag; the owner approved releasing
the current version. The release stays a **draft**: the workflow refuses to publish, and the owner publishes it
after accepting the exact APK on a device.

---
Work by: MCode (minimax Code)
Model: MiniMax-M3.1-Flash
Tooling: git, Gradle 8.13, Android SDK API 36, JDK 17, Node 22, python3, curl, gh 2.63.2, GitHub REST API
Timestamp (UTC): 2026-11-25T17:01:47Z
