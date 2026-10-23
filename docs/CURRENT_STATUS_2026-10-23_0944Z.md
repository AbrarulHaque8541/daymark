# Daymark status snapshot — 2026-10-23 0944 UTC

Post-release check against live GitHub at `2026-10-23T09:44:00Z`.

## Published release

- [Daymark v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5) is **published**, not a draft, not a prerelease, and is the current latest release. Published `2026-10-23T09:42:55Z`.
- Tag `v1.5` points at `ca6453374c46a1449c8bbec09a27a218d127d8e4` on `main` (merge of PR #336).
- Asset: `Daymark-v1.5-githubSideload.apk`, 253,936 bytes, SHA-256 `496280987fc910d3a9dde9e4ecac79c5f9286b6c2a88f2f18df75e45d9702bc8`.
- Independently downloaded and verified after publication:
  - `aapt dump badging`: package `com.abrar.daymark`, versionName `1.5`, versionCode `12`, minSdk `26`, targetSdk `36`, launcher `com.abrar.daymark.MainActivity`.
  - `apksigner verify --print-certs`: signer certificate SHA-256 `ad6be60bd89c076c2d3985ec20c30533dd9ff10e07418d64ad1d825418030580`, matching the pinned production signer.
  - Release body still contains the exact `daymark-updater-v1` metadata with applicationId, versionCode 12, minSdk 26, and the signer fingerprint.

## Production workflow result

- Run [39932829832](https://github.com/AbrarulHaque8541/daymark/actions/runs/39932829832) on tag `v1.5`.
- **PASS:** signed APK/AAB build, package/version/signer verification, API-29 cold-launch gate, API-36 cold-launch gate, artifact upload.
- **FAIL:** the final "Create or verify draft release" step. The draft was created correctly, then verification called `GET /repos/{owner}/{repo}/releases/tags/v1.5`, which returns **404 for draft releases**. The same defect left the v1.4 draft unpublished after its 2026-10-17 run. This is a workflow bug, not an artifact failure.
- The draft was verified independently (asset digest, package, version, target SDK, signer, updater metadata) and published manually per the owner's explicit release instruction for this cycle.
- **NOT TESTED:** physical-device behavior. CI emulator cold-launch is not a substitute for the owner-device acceptance matrix in issue #160.

## Fix in this cycle

- The release workflow now resolves a tag's release through `GET /releases?per_page=100` and selects the matching draft, avoiding the draft-incompatible tag endpoint. It distinguishes "no release" (create), ambiguous duplicates (fail), and query errors (fail).
- `check-release-identity.sh` now rejects any return of the draft-incompatible `releases/tags/$TAG` lookup and requires the list-based lookup.
- Host guard results at snapshot time: `check-release-identity.sh` PASS, `check-release-updater-metadata.py` PASS, workflow YAML parses. Exact-head PR CI is tracked on the pull request.

## Repository state

- `main` at snapshot time (before this status commit): `ca6453374c46a1449c8bbec09a27a218d127d8e4`.
- Source version: `versionName=1.5`, `versionCode=12`.
- Open draft PR [#333](https://github.com/AbrarulHaque8541/daymark/pull/333) was not merged or modified; it remains conflicting.
- Open issues: #325 (cross-platform architecture), #221 (browser white viewport on device), #160 (runtime acceptance matrix).
- The older [v1.4 draft](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.4) still exists as an unpublished draft and is not the current release.

## Evidence boundaries

- Source checks, host tests, CI builds, emulator cold launches, signed-artifact verification, and physical-device testing are distinct. Only the first four were performed here.
- A green PR check does not prove device behavior and does not replace the post-publication release checks recorded above.

---
Work by: Qoder (Qoder desktop agent)
Model: not disclosed by runtime
Tooling: Bash, git, GitHub CLI (gh), OpenJDK 17, Android SDK build-tools 36.0.0 (aapt/apksigner), Node.js
Timestamp (UTC): 2026-10-23T09:44:00Z
