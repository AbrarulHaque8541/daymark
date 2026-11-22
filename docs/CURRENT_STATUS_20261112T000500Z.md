- During the busy window of onClearAll / onClearCategory, the dedicated Clear all button now receives aria-busy="true" (and removes it when idle), in addition to the existing disabled + is-busy class that drives the accent spinner.
- Existing confirmation disclosure, category clear, and status reporting unchanged.
- Local syntax / visual inspection of the change: PASS.
- npm test / source guards: NOT RUN in this environmen
- Physical device / real screen reader: NOT TESTED.
- Small accessibility improvement on the storage card Clear all control.
- This makes the loading state explicit for assistive technology while the confirmation-gated destructive action runs.
# Daymark engineering status — 20261112T000500Z (storage clear a11y busy state)
## Verification
## What shipped
No Android, MainActivity, package, signer or core storage key changes.
No leftover stubs or incomplete paths.
Scope: web prototype storage card only (storage-ui.js).
