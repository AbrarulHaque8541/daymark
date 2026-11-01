# Daymark whole-project engineering status — 2026-11-01T09:17:44Z

## Fresh baseline and ownership
- Repository: `AbrarulHaque8541/daymark`; default branch `main`.
- Current main SHA at start: `fdec854bfa6edc8ca1cf04eec446f9ee1a84e943`.
- Root `AGENTS.md`, `docs/AGENT_STATUS.md`, `PROJECT_PLAN.md`, `docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md`, and `docs/TASK_REMINDERS.md` re-read.
- Open PRs: [#474](https://github.com/AbrarulHaque8541/daymark/pull/474) Android reminder-trigger + recurrence; [#475](https://github.com/AbrarulHaque8541/daymark/pull/475) web strict-future recurrence + monthly/yearly anchors.
- Open issue [#476](https://github.com/AbrarulHaque8541/daymark/issues/476) requests cross-platform recurrence parity, long-gap catch-up, and leap-year anchoring.
- No review threads on #474 or #475. Active branches: `fix/android-repeat-reminder-trigger-20261101`, `fix/web-repeat-strict-next-20261101-0837`; their changed files are disjoint. #474 branch at start was exactly one commit ahead of main: `4bf49199cf9fe52898c28eaae92938a8d08582b3`.

## Cross-agent audit
- #474 actual diff: TaskLogic reminder-trigger semantics and two host tests. Confirmed no MainActivity edits and no shared-file overlap.
- #475 actual diff: `repeat-logic.js`, `app.js`, storage/logic tests and status docs. It implements strictly-future recurrence and monthly/yearly anchors in web. Its earlier code/test SHA `8fec42ff2b299dd782fc48b1e901fb930a1140c4` had PR-triggered workflows cancelled; the branch then advanced one doc-only commit. Exact current PR-head SHA could not be surfaced by the connector wrapper, so do not claim current-head CI from those earlier cancelled runs.
- Independent source audit found Android's `advanceRepeat()` still has a 3,660-step cap, and yearly `LocalDate.plusYears()` loses the Feb-29 series anchor. This PR expands #474 on the same TaskLogic branch without touching #475's web files.

## Implemented on PR #474
- Reminder trigger still advances at configured reminder fire time.
- Replaced fixed 3,660-iteration recurrence loop with calendar arithmetic for daily, weekly, weekdays, monthly, and yearly catch-up.
- Monthly and yearly rules share persisted `repeatDayOfMonth` (schema v5 / DMM3 already have the field); yearly Feb-29 anchors clamp in short years and return in leap years.
- Task creation/edit preserves yearly anchor; changing due date starts a new anchor.
- Legacy v5 snapshots and DMM3 yearly backups with null/zero anchor normalize to their current due-date day; no schema/backup version bump.
- DMM3 parser accepts yearly anchors 1–31 while retaining 0 as the pre-anchor legacy value; monthly anchors remain required. Yearly anchors are checked against the date except preserved Feb-29 clamping.

## Regression coverage added
- 26-year catch-up: daily, weekly, weekdays, monthly.
- Yearly Feb-29: catch-up in 2026 preserves day 29 and returns to Feb 29 in 2028.
- Yearly anchor survives rename and resets only when due date changes.
- Invalid/mismatched yearly anchor rejected.
- Encrypted snapshot round-trip plus legacy v5 null-anchor fallback.
- DMM3 yearly anchor round-trip plus legacy DMM3 zero-anchor compatibility.

## Files changed
- `Task.java`
- `TaskLogic.java`
- `PortableBackupCodec.java`
- `TaskLogicSmoke.java`
- `TaskSnapshotCodecSmoke.java`
- `PortableBackupSmoke.java`
- `docs/TASK_REMINDERS.md`

## Validation and delivery
- Local Java host tests/build: **NOT RUN**; no repository shell/JDK in connector runtime.
- Exact-head run for earlier code HEAD `643ac38813d2d4d34621499d1a9fba6f1b348113`:
  - Android CI #41292374004: **FAIL** during Java compile.
  - Ubuntu shared contracts in #41292374029: **FAIL** at the same Java compile.
  - Root cause: Java fixture used single-quoted multi-character string literals in `TaskSnapshotCodecSmoke.java`.
- Corrected the fixture in commits `e59b03445469312d24d7144f5f6a90344d02beab` and `ea20c32c435e2ea0aa1b3c958c87172d7842b137`. The final source lines now use properly escaped Java double-quoted strings.
- Latest code/test HEAD: `ea20c32c435e2ea0aa1b3c958c87172d7842b137`; fresh exact-head workflows are expected/pending. Do not treat earlier failed/cancelled runs as validation.
- Physical Android alarm/notification acceptance: **NOT TESTED** (#160).
- Physical Android alarm/notification acceptance: **NOT TESTED** (#160).
- PR #474 stays OPEN until exact-head CI passes and physical reminder behavior is accepted; no merge bypass.
- No package identity, manifest permission, signer, version, release/tag, schema version, or destructive data change.

## Prioritized backlog
1. **P0 #160** — owner/device tester: physical Android/WebView runtime matrix, exact device/API/WebView/build/APK SHA and scenario results (**NOT TESTED**).
2. **P1 #476** — shared engineering: cross-platform recurrence parity; web #475 plus Android catch-up/leap anchor in #474. Validate merge order and current-head CI.
3. **P1 #348** — shared engineering + device tester: browser reliability (SAF/download race, renderer recovery, redirects/cookies/forms, app links, keyboard/insets/accessibility).
4. **P2 #325** — shared engineering: evidence-based platform matrix/benchmark before architecture rewrite.

---
Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub MCP (live repo/branch/PR/issue/commit/contents/Actions), V8 source editing/validation harness
Timestamp (UTC): 2026-11-01T09:17:44Z
