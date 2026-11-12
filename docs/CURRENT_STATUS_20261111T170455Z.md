# Daymark engineering status — 20261111T170455Z (storage card dedicated Clear all binding, issue #740)

Scope: web prototype only (index.html, storage-ui.js, browser-data-logic.js and their tests).
No Android, manifest, MainActivity, package id, signer, storage-key or CI changes.

## What shipped (PR pending at snapshot time)
- Issue #740 correction, end to end. The storage card previously had dead markup:
  index.html exposed storage-check / storage-clear / storage-status-line / storage-list,
  while storage-ui.js only resolved the legacy data-* ids, so no control was wired and
  the destructive Clear All affordance was missing entirely.
- storage-ui.js now binds the live page ids (storage-list, storage-status-line, storage-check)
  in addition to the legacy data-* ids. The destructive handler resolves ONLY from
  storage-clear-all / data-clear-all; #storage-clear ("Clear status") is bound to a
  read-only status reset and is never a destructive fallback. Clear status is disabled
  with the other controls while a clear operation is busy.
- index.html storage card gains the dedicated "Clear all local data" button
  (#storage-clear-all) with an explicit aria-label; the existing explicit destructive
  confirmation in onClearAll() is unchanged and still discloses everything it removes.
- browser-data-logic.js: the storage-clear-status catalog entry is now available and
  honestly non-destructive (it previously claimed the controls were not connected);
  a new storage-clear-all entry documents the destructive scope, the absence of undo,
  and that task exports cannot restore everything. The clear-action card select gains
  the matching option.
- Tests: additive page-id behavior + markup/source pins in tests/storage-ui.test.js;
  updated catalog pins in tests/browser-data-logic.test.js; the browser-data-ui
  unavailable-action coverage moved to the unknown-id path plus new wired-control
  assertions in tests/browser-data-ui.test.js.

## Verification
- Sandbox behavioral harness (real storage-logic.js + new storage-ui.js, fake DOM):
  PASS — 17/17 assertions across live-page-id render, Clear status read-only,
  Clear all confirmed destructive, Check rescan, and legacy data-* compatibility.
- Syntax parse checks on all modified JS files: PASS.
- npm ci / npm test / sh android-app/tools/check-v1-source.sh locally: NOT RUN
  (no Node or Android toolchain in this environment; CI runs them on the PR head).
- CI on the exact PR head: reported honestly in issue #740 after the runs conclude.

## Not tested
- On-browser manual behavior of the storage card (visual layout, focus order with a
  real keyboard, real confirm() dialog): NOT TESTED (no browser in this environment).
