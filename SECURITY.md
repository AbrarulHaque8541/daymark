# Security Policy

## Version and report-triage status

**Checked:** 2026-11-10. This table describes vulnerability-report handling, not a promise of ongoing support, release qualification, or device compatibility. Verify the live [GitHub Releases](https://github.com/AbrarulHaque8541/daymark/releases) page for the latest published artifacts. The canonical repository is `AbrarulHaque8541/daymark`; legacy `ai-personal-task-assistant` links redirect to this repository.

| Version/source | Verified boundary | Security-report status |
|---|---|---|
| [Latest published: v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5) | Published 2026-10-23. Production package `com.abrar.daymark`, versionCode 12, target API 36, using the pinned production signer. This is the latest published artifact; it does not include source-only changes made after its tag. | Reports accepted; best-effort triage. This is not a support or device-qualification guarantee. |
| Current `main` source | Package `com.abrar.daymark`, versionName 1.6 / versionCode 13, minSdk 26 / target API 36. No production release for source version 1.6 has been published. | Reports accepted; best-effort triage. Source status is not a published or qualified release. |
| Draft release | v1.4 remains a draft and is not the latest published release. Do not describe it as available to users. | Reports accepted; best-effort triage. |
| Earlier tags/builds | Historical; attached assets and verification vary by tag. Check the exact release and artifact before assessing exposure. | Reports accepted; best-effort triage. |

## Reporting a Vulnerability

We take the security of Daymark and its users seriously. If you believe you have found a security vulnerability in this repository, please do not disclose it publicly.

1. **Email reports:** Contact `abrarbhai441@gmail.com` with the subject line `[SECURITY] <Brief Description>`.
2. **Details:** Include reproduction steps, affected versions, and potential impact. Do not include another person's private data or credentials.
3. **Response:** The project aims to acknowledge reports within 48 hours and provide a remediation timeline; this is an aim, not a guaranteed service-level commitment.
4. **Data-protection boundaries:**
   - Task and attachment payloads use at-rest encryption; unencrypted metadata/settings and key/recovery limits are documented.
   - Updates must preserve user data and signing identity, but failure boundaries remain; do not promise zero data loss.
   - Network features use HTTPS. Verify downloaded artifacts against trusted publisher and digest data; HTTPS alone does not establish artifact authenticity.
