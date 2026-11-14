- [Daymark engineering status — 2026-11-14T19:35:25Z (Android URI routing correction, PR #779)](./CURRENT_STATUS_20261114T193525Z.md)
- [Daymark engineering status — 2026-11-14T18:57:06Z (Android bookmark shortcuts + URI routing, PR #779)](./CURRENT_STATUS_20261114T185706Z.md)
- [Daymark engineering status — 2026-11-14T16:46:24Z (permission-lifecycle planner card, branch feat/permission-lifecycle-vibe-20261114)](./CURRENT_STATUS_20261114T164624Z.md)
- [Daymark engineering status - 2026-11-14T12:37:30Z (Cycle A task view reset polish)](./CURRENT_STATUS_20261114T123730Z.md)
- [Daymark engineering status - 2026-11-14T08:35:00Z (Cycle A task view preference persistence)](./CURRENT_STATUS_20261114T083500Z.md)
- [Daymark engineering status - 2026-11-14T04:40:00Z (Cycle B dictionary structured results polish)](./CURRENT_STATUS_20261114T044000Z.md)
- [Daymark engineering status - 2026-11-14T04:22:09Z (keyless dictionary lookup card, branch feat/dictionary-card-vibe-20261114)](./CURRENT_STATUS_20261114T042209Z.md)
- [Daymark engineering status — 2026-11-14T04:00:00Z (Cycle B verification: clear-completed busy polish)](./CURRENT_STATUS_20261114T040000Z.md)
- [Daymark engineering status — 2026-11-14T02:45:00Z (Cycle B verification: storage fencing complete, UI polish consistent)](./CURRENT_STATUS_20261114T024500Z.md)
- [Daymark engineering status — 2026-11-14T00:50:00Z (Cycle B verification of storage fencing + clear-completed busy polish)](./CURRENT_STATUS_20261114T005000Z.md)
- [Daymark engineering status — 2026-11-13T16:23:00Z (address-bar insights card, branch feat/url-insights-vibe-20261113)](./CURRENT_STATUS_20261113T162300Z.md)
- [Daymark engineering status — 2026-11-13T04:39:18Z (keyless GitHub release radar card, branch feat/release-radar-vibe-20261113)](./CURRENT_STATUS_20261113T043900Z.md)
- [Daymark engineering status — 2026-11-12T04:50:00Z (daylight and UV planner card, branch feat/daylight-card-vibe-20261112)](./CURRENT_STATUS_20261112T045000Z.md)

# Agent status index

- [CURRENT_STATUS_20261114T193525Z.md](./CURRENT_STATUS_20261114T193525Z.md) — Android URI-routing correction on branch feat/android-bookmark-newtab-20261114, PR #779 OPEN and unmerged; remote parent `97e3a5f` was verified before the local candidate. Host/source/Node checks PASS; Android compile/device runtime NOT TESTED; API 36 remains unresolved pending exact-new-head CI.
- [CURRENT_STATUS_20261114T185706Z.md](./CURRENT_STATUS_20261114T185706Z.md) — Historical pre-correction status snapshot; superseded by the newer URI-routing update above.
- [CURRENT_STATUS_20261114T181151Z.md](./CURRENT_STATUS_20261114T181151Z.md) — Historical bookmark-only snapshot at 2026-11-14T18:11:51Z, head `0e137da`; its description applies only to that point in time. Later URI routing was added to the same branch/PR; see the latest snapshot above.
- [CURRENT_STATUS_20261114T044000Z.md](./CURRENT_STATUS_20261114T044000Z.md) — Cycle B verification: Cycle A dictionary card complete; small structured-results polish added on branch. Physical device NOT TESTED.
- [CURRENT_STATUS_20261114T042209Z.md](./CURRENT_STATUS_20261114T042209Z.md) - keyless dictionary lookup card (Free Dictionary API) on branch feat/dictionary-card-vibe-20261114. Physical device NOT TESTED.
- [CURRENT_STATUS_20261114T040000Z.md](./CURRENT_STATUS_20261114T040000Z.md) — Cycle B verification: Cycle A storage fencing complete; small clear-completed busy feedback polish added on branch. Physical device NOT TESTED.
- Previous: [CURRENT_STATUS_20261114T024500Z.md](./CURRENT_STATUS_20261114T024500Z.md) — Cycle B verification: Cycle A storage fencing complete on main `3b8557e`; UI polish consistent. Physical device NOT TESTED.

## Before acting

1. Open the latest snapshot for context.
2. Re-check live `main` SHA, relevant open/closed PRs and issues, and Actions runs for exact heads; verify Releases/tags when release decisions are involved.
3. If documents conflict, live source/GitHub evidence wins for current state; record the discrepancy and create/update the next dated snapshot. Never copy old SHA values or status labels as if they were current.

## Snapshot maintenance

- Keep durable policy in root `AGENTS.md`; do not repeat it in every snapshot.
- Put current versions, releases, PR/issue state, agent assignments, CI results, blockers, and device-test status in dated snapshots.
- Preserve old snapshots as historical evidence. Add a new snapshot rather than rewriting the past to make it appear current.
- Always include the verification timestamp, evidence links, exact commit/PR heads where relevant, and what was **not** tested.
- Do not report “PASS”, “merged”, “published”, or “device verified” without evidence for the exact object.
