- [Daymark engineering status — 2026-11-08T22:45:00Z (press feedback polish on task rows/cards, PR #637)](./CURRENT_STATUS_20261108T224500Z.md)
- [CURRENT — Daymark whole-project engineering status — 2026-11-08T09:20:00Z (PR #600 exact CI, PRs #599/#601 integration, Gradle distribution reliability, browser address review)](./CURRENT_STATUS_20261108T092000Z.md)
- Previous snapshot: [Daymark whole-project engineering status — 2026-11-08T08:47:25.228Z (PRs #599/#600, current main CI and device blockers)](./CURRENT_STATUS_20261108T084725Z.md)
- Use the CURRENT snapshot above for live branch/CI/backlog state; older entries below are historical.

# Agent status index

**Purpose:** A stable landing page for time-sensitive project facts. Durable rules live in [`AGENTS.md`](../AGENTS.md); snapshots are dated and can go stale.

## Latest reviewed snapshot
- [Daymark whole-project engineering status — 2026-11-08T08:47:25.228Z (PRs #599/#600, current main CI and device blockers)](./CURRENT_STATUS_20261108T084725Z.md)

- [Daymark engineering status — 2026-11-07T16:27:27Z (browser download safety card)](./CURRENT_STATUS_20261107T162727Z.md)

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
