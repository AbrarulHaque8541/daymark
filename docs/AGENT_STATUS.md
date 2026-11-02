- [Daymark whole-project engineering status — 2026-11-02T02:45:00Z](./CURRENT_STATUS_20261102T024500Z.md)
- [Daymark whole-project engineering status — 2026-11-02T00:45:00Z](./CURRENT_STATUS_20261102T004500Z.md)
- [Daymark whole-project engineering status — 2026-11-02T05:30:00Z](./CURRENT_STATUS_20261102T053000Z.md)
- [Daymark whole-project engineering status — 2026-11-02T00:05:00Z](./CURRENT_STATUS_20261102T000500Z.md)
- [Daymark whole-project engineering status — 2026-11-01T18:25:23Z](./CURRENT_STATUS_20261101T182523Z.md)
- [Daymark whole-project engineering status — 2026-11-01T17:47:00Z](./CURRENT_STATUS_20261101T174700Z.md)
- [Daymark whole-project engineering status — 2026-11-01T17:30:00Z](./CURRENT_STATUS_20261101T173000Z.md)
- [Daymark whole-project engineering status — 2026-11-01T15:40:00Z](./CURRENT_STATUS_20261101T154000Z.md)
- [Daymark whole-project engineering status — 2026-11-01T09:56:00Z](./CURRENT_STATUS_20261101T095600Z.md)
- [Daymark whole-project engineering status — 2026-11-01T08:44:33Z](./CURRENT_STATUS_20261101T084433Z.md)

# Agent status index

**Purpose:** A stable landing page for time-sensitive project facts. Durable rules live in [`AGENTS.md`](../AGENTS.md); snapshots are dated and can go stale.

## Latest reviewed snapshot

- [Daymark whole-project engineering status — 2026-11-02T02:45:00Z](./CURRENT_STATUS_20261102T024500Z.md)

## Before acting

1. Open the latest snapshot for context.
2. Re-check live `main` SHA, relevant open/closed PRs and issues, and Actions runs for exact heads; verify Releases/tags when release decisions are involved.
3. If documents conflict, live source/GitHub evidence wins for current state; record the discrepancy and create/update the next dated snapshot. Never copy old SHA values or status labels as if they are current.

## Snapshot maintenance

- Keep durable policy in root `AGENTS.md`; do not repeat it in every snapshot.
- Put current versions, releases, PR/issue state, agent assignments, CI results, blockers, and device-test status in dated snapshots.
- Preserve old snapshots as historical evidence. Add a new snapshot rather than rewriting the past to make it appear current.
- Always include the verification timestamp, evidence links, exact commit/PR heads where relevant, and what was **not** tested.
- Do not report “PASS”, “merged”, “published”, or “device verified” without evidence for the exact object.
