- [Daymark engineering status — 2026-11-07T000500Z (Cycle A: fail-closed downloads + estimatedMinutes)](./CURRENT_STATUS_20261107T000500Z.md)

- [Daymark engineering status — 2026-11-06T050500Z (public-holidays card)](./CURRENT_STATUS_20261106T050500Z.md)

# Agent status index

**Purpose:** A stable landing page for time-sensitive project facts. Durable rules live in [`AGENTS.md`](../AGENTS.md); snapshots are dated and can go stale.

## Latest reviewed snapshot

- [Daymark engineering status — 2026-11-07T000500Z (Cycle A: fail-closed downloads + estimatedMinutes)](./CURRENT_STATUS_20261107T000500Z.md)

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
