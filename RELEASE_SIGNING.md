# Daymark — release identity and signing contract

This document describes durable release rules plus a dated source/release snapshot. Verify the live `main` branch, GitHub Releases, and exact workflow run before acting.

## Current source and published release (checked 2026-10-26)

- Live `main` is `cac2d7524491a3fce488e57b5cf810dc7b5c5017`. Source uses application ID `com.abrar.daymark`, `versionName = 1.5`, `versionCode = 12`, `compileSdk = 36`, and `targetSdk = 36`, with AGP 8.12.2 and Gradle 8.13.
- Latest published release is [**v1.5**](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), published 2026-10-23. Its tag points to `ca6453374c46a1449c8bbec09a27a218d127d8e4`; the release contains one APK (`Daymark-v1.5-githubSideload.apk`, 253,936 bytes, SHA-256 `496280987fc910d3a9dde9e4ecac79c5f9286b6c2a88f2f18df75e45d9702bc8`) targeting API 36 with versionCode 12. The release metadata records the pinned production signer. The v1.4 release remains a draft and is not the latest published release.
- Production workflow [run 39932829832](https://github.com/AbrarulHaque8541/daymark/actions/runs/39932829832) ended with a failure in its final draft-release verification after creating the draft. The artifact was independently verified and published separately; merged [PR #337](https://github.com/AbrarulHaque8541/daymark/pull/337) fixes the draft lookup for future runs. Current-main Android CI [run 39934982721](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982721) and cross-platform contract [run 39934982786](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982786) passed on the exact current-main SHA.
- Google's [developer-verification FAQ](https://developer.android.com/developer-verification/guides/faq) says direct sideloads are outside the initial September 2026 enforcement phase, with global expansion planned for 2027. Before broader distribution, review the [Android Developer Console package/key registration](https://developer.android.com/developer-verification/guides/android-developer-console) path for this package and existing signing certificate; do not rotate the production key as a workaround. No registration was performed in this review.
- Do not infer publication from Gradle values or CI. The live Releases page is the source of truth for published assets; the current source values are in [`android-app/app/build.gradle.kts`](android-app/app/build.gradle.kts).

The canonical GitHub repository slug is now `AbrarulHaque8541/daymark`. Older documents that say the repository rename is still pending are historical and should be updated when touched.

## Immutable identity and signer

| Field | Current value | Rule |
|---|---|---|
| `applicationId` | `com.abrar.daymark` | Owner-approved identity; do not change without explicit owner approval. |
| Production keystore | GitHub Actions secrets only | Keep key material out of source and artifacts other than the signed app. |
| Signing secrets | `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` | Preserve the configured production secrets; never ask the owner to send keystore files or passwords. |
| Production cert SHA-256 | `ad6be60bd89c076c2d3985ec20c30533dd9ff10e07418d64ad1d825418030580` | Must match the signer pin in `UpdaterPublisherConfig` and every production APK. |

This repository's release and updater checks require exact production-signer continuity. Do not rotate or replace the key without a separately approved and verified migration. For the **same application ID**, a different signer can prevent an in-place Android update; for **different application IDs**, the apps are separate installs even when they use the same signer. Neither case permits an automatic transfer of app-private encrypted task data.

## Version and publication rules

1. Keep `versionCode` strictly increasing.
2. Keep `versionName` in `android-app/app/build.gradle.kts`; the production tag must be exactly `v` + that value.
3. Push the exact version tag only after code/host checks pass; the production workflow must create a **draft**, not a public release, after signed-artifact and API-29/API-36 cold-launch gates pass.
4. The workflow attaches only the installable APK to a draft and verifies its checksum/metadata. It must not mark the draft latest or publish it. The owner must download that exact draft APK, verify SHA-256, and cold-launch it on the physical device; only then may the owner manually publish the draft. Main Android CI is not a signed production release.
5. The expected APK asset name is `Daymark-v{versionName}-githubSideload.apk`; verify the actual release assets and checksums before distribution.
6. A successful CI build does not establish Android-device behavior or upgrade/data-migration compatibility.

## Separate-install and data boundary

The current owner-approved application identity is separate from the previously published app line. Installing it does not replace that app or carry its app-private encrypted data across. The user must retain access to the earlier installation and use Daymark's explicit encrypted backup/restore flow if they choose to move tasks; no automatic package-to-package migration is implemented. Reusing the production signer preserves publisher verification, but does not make distinct application IDs update-compatible.

## Historical package-conflict note — 2026-10-08

A prior device reported Android's “App not installed as package conflicts with an existing package” error when a production-signed build was installed over a build signed with a different certificate (for example, a debug build). For the same application ID, the signing mismatch is an Android install/update constraint, not evidence that a new production key should be generated.

The original recovery note referred to backing up, uninstalling that specific older install, then installing [v1.0.2](https://github.com/AbrarulHaque8541/daymark/releases/download/v1.0.2/Daymark-v1.0.2.apk) and restoring. That is **historical, device-specific guidance**, not a general update path. Do not tell a user to uninstall as a routine fix; uninstall can remove the encrypted task file and its device-held key. Confirm a usable backup/recovery plan before any user chooses to remove an installation.

After a clean install, a later build can update in place only when it has the same application ID, the accepted signer continuity, and a higher `versionCode`. A different application ID installs alongside the earlier app and does not migrate its data automatically.

## Required production-release sequence

1. On `main`, set the intended `versionName` and a higher `versionCode` in `android-app/app/build.gradle.kts`.
2. Preserve `UpdaterPublisherConfig.PUBLISHER_SIGNER_SHA256` and the protected signing secrets.
3. Complete review and merge the release change under the owner's authority.
4. Only when the owner authorizes publication, create/push the exact `v<versionName>` tag on the intended `main` commit.
5. Wait for the workflow to create a draft; verify exact commit, package/version/target-SDK/signer assertions and the APK SHA-256. Test the exact draft APK on the owner device before manually publishing the draft. Never treat a successful workflow alone as release approval.
6. Describe an update as in-place only for a compatible same-application-ID installation. For the current separate identity, do not promise replacement of the older app or automatic data transfer.

## Debug vs. production

| Build | Signature | Can update a production install? |
|---|---|---|
| `assembleGithubSideloadDebug` | Debug keystore | **No** — signer differs from production. |
| `assembleGithubSideloadRelease` + protected production secrets | Production keystore | **Only if** application ID matches, signer continuity is accepted, and `versionCode` is higher. |

Use debug builds for development; never present one as a production release or tell an end user to sideload it over a production installation.

## Portable backup

Before a user voluntarily removes an installation, advise them to use **More → Encrypted backup / restore** and confirm they have retained the recovery key separately. Restoring is an explicit user action; it is not an automatic migration, and an unavailable or lost device-held key cannot be replaced by changing the signer or application ID.

---
Work by: Vibe
Model: GLM (glm-5-latest-short)
Tooling: GitHub MCP tools
Timestamp (UTC): 2026-10-16T15:15:06Z
