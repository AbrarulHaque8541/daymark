# Daymark engineering status — 2026-11-17T10:05:00Z (Cycle A: remove duplicate script load)

## What changed
- Fixed redundant load of `task-mutation-logic.js` in `index.html` (was included twice: early after task-logic and late after storage-logic). Kept the early load so it remains available before export/webhook/app consumers. Removed the duplicate to avoid unnecessary re-parse and any potential double-registration risk.
- Small related improvement: added `title="Open tasks count"` on the heading-stat for better discoverability/tooltip on the open-count badge. Matches existing glass language; no behavior change.

## Verification
- Source inspection of index.html script order — complete, only one task-mutation-logic.js, order preserved for tests.
- Local file edit — complete, no stubs or truncated content.
- Physical device: NOT TESTED.
- CI will run on the PR head.

Base: main `b0861f6b37bd3db7ec6325441731cd0a2566e9b7`
No open PRs at start. Critical paths clean.

Work by: Grok 4.7 (Cycle A)
Model: Grok 4.7
Tooling: GitHub connector, local git clone for edit
Timestamp (UTC): 2026-11-17T10:05:00Z
