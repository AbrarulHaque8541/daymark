#!/usr/bin/env python3
"""Source-level guard for Daymark's device-test APK provenance contract."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANUAL_WORKFLOW = (ROOT / ".github/workflows/device-test-apk-manual-build.yml").read_text()
SIGNED_RELEASE_WORKFLOW = (ROOT / ".github/workflows/android-signed-device-test-release.yml").read_text()
PRIVATE_MAIN_WORKFLOW = " ".join(
    (ROOT / ".github/workflows/android-private-main-test-apk.yml").read_text().split()
)
PRODUCTION_RELEASE_WORKFLOW = (ROOT / ".github/workflows/android-production-release.yml").read_text()
OWNER_GATE = "github.actor == 'AbrarulHaque8541' && github.triggering_actor == 'AbrarulHaque8541'"
ATTEST_ACTION_SHA = "1e69f48acb82d1966a394da916b4c1698aa569d6"

checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


# Manual dispatch remains useful for local/CI build validation, but can never
# generate provenance or mutate a release.
check("workflow_dispatch:" in MANUAL_WORKFLOW and "push:" not in MANUAL_WORKFLOW
      and "pull_request:" not in MANUAL_WORKFLOW,
      "the standalone manual APK workflow must remain manual-only")
check("assembleGithubSideloadDebug" in MANUAL_WORKFLOW
      and "app-githubSideload-debug.apk" in MANUAL_WORKFLOW,
      "manual dispatch must retain the non-publishing debug APK build")
for forbidden in ("uses: actions/attest@", "id-token: write", "attestations: write",
                  "contents: write", "gh release", "slsa-github-generator"):
    check(forbidden not in MANUAL_WORKFLOW,
          f"manual dispatch must not publish provenance or release assets: {forbidden}")
check(not (ROOT / ".github/workflows/generator-generic-ossf-slsa3-publish.yml").exists(),
      "the obsolete generic-generator workflow must be removed")

# Production signing, attestation and release publication remain owner-only and
# protected by the existing environment and exact tag-on-main verification.
signed_build = SIGNED_RELEASE_WORKFLOW.split("  build-and-verify:", 1)[1].split("  publish-release:", 1)[0]
signed_publish = SIGNED_RELEASE_WORKFLOW.split("  publish-release:", 1)[1]
check(OWNER_GATE in signed_build and OWNER_GATE in signed_publish,
      "production signing and release/provenance writes must be owner-triggered only")
check("environment: production-signing" in signed_build
      and "environment: production-signing" in signed_publish,
      "both signed build and provenance publication must wait on production-signing")
check("pull_request:" not in SIGNED_RELEASE_WORKFLOW
      and "workflow_dispatch:" not in SIGNED_RELEASE_WORKFLOW
      and "tags:" in SIGNED_RELEASE_WORKFLOW
      and "v*-device-test.*" in SIGNED_RELEASE_WORKFLOW,
      "signed release and provenance must remain device-test tag-push-only")
check("git tag --points-at HEAD" in signed_build
      and "git merge-base --is-ancestor \"$GITHUB_SHA\" refs/remotes/origin/main" in signed_build,
      "the exact tag commit must be verified as reachable from main before signing")
check("contents: write" in signed_publish and "id-token: write" in signed_publish
      and "attestations: write" in signed_publish,
      "only the owner-gated protected publish job may obtain release-write and attestation permissions")

# The new signer attests the verified production-signed APK itself, not an
# independent debug rebuild, and is pinned to the reviewed Node24 release.
attest_step = signed_publish.split("      - name: Generate provenance for the exact signed APK", 1)[1].split(
    "      - name: Publish and independently verify the provenance bundle", 1
)[0]
check(f"uses: actions/attest@{ATTEST_ACTION_SHA}" in attest_step
      and "v4.2.2" in attest_step and "Node 24" in attest_step,
      "the first-party attestation action must be immutably pinned to the Node24 v4.2.2 release")
check("subject-path: ${{ steps.payload.outputs.apk_path }}" in attest_step,
      "the attestation subject must be the exact signed APK whose payload digest was verified")
check("steps.payload.outputs.apk_path" in signed_publish
      and "EXPECTED_SHA256" in signed_publish
      and 'sha256sum "$APK_PATH"' in signed_publish,
      "the signed APK digest must be rechecked before provenance publication")
check("assembleGithubSideloadRelease" in signed_build
      and "app-githubSideload-release.apk" in signed_build,
      "the published subject must originate from the production-signed release variant")
check("Daymark-device-test-${tag}.apk" in signed_build,
      "the release APK filename contract must remain unchanged")

# Preserve a portable Sigstore bundle on the same prerelease and prove that the
# downloaded bundle verifies against the exact release APK and expected signer.
check('bundle_name="${APK_NAME}.sigstore.json"' in signed_publish,
      "the Sigstore bundle must have a predictable filename tied to the APK")
check("gh release upload \"$TAG\" \"$bundle_source\"" in signed_publish
      and "--clobber" not in signed_publish,
      "the bundle must be attached to the same release without overwriting existing assets")
check("gh release download \"$TAG\"" in signed_publish
      and "cmp -s \"$bundle_source\" \"$downloaded_bundle\"" in signed_publish,
      "the uploaded release bundle must be downloaded and byte-verified")
check("gh attestation verify \"$APK_PATH\"" in signed_publish
      and "--bundle \"$downloaded_bundle\"" in signed_publish
      and "--signer-workflow \"$SIGNER_WORKFLOW\"" in signed_publish
      and "--source-ref \"$GITHUB_REF\"" in signed_publish,
      "the release bundle must be independently verified for APK digest, workflow identity and source tag")
check("api_verified=true" in signed_publish
      and "GitHub Attestations API did not return a matching provenance record" in signed_publish,
      "the GitHub-hosted attestation record must also be independently queryable")
check("Preflight an existing release provenance bundle" in signed_publish
      and "existing_bundle=true" in signed_publish
      and "refusing to overwrite it" in signed_publish,
      "retries must verify an existing bundle and fail closed rather than replace it")
check(".prerelease == true" in signed_publish
      and "--prerelease --verify-tag" in signed_publish
      and "--rawfile notes" in signed_publish,
      "provenance attachment must preserve the existing published-prerelease and exact-release-metadata contract")
FINAL_APK_CHECK = "      - name: Re-download and verify the final release APK after provenance"
check(FINAL_APK_CHECK in signed_publish
      and signed_publish.index(FINAL_APK_CHECK) > signed_publish.index("api_verified=true"),
      "the final release APK must be checked after bundle and hosted-attestation verification")
final_apk_check = signed_publish.split(FINAL_APK_CHECK, 1)[1]
release_download_curl_lines = [
    line for line in SIGNED_RELEASE_WORKFLOW.splitlines() if "curl " in line
]
check(len(release_download_curl_lines) == 2
      and all("--proto '=https' --proto-redir '=https' --tlsv1.2" in line
              for line in release_download_curl_lines),
      "both public release APK downloads must restrict initial and redirected protocols to HTTPS")
check('gh api "repos/$GITHUB_REPOSITORY/releases/tags/$TAG"' in final_apk_check
      and '"$asset_size" == "$EXPECTED_SIZE"' in final_apk_check
      and '"$asset_url" == "$expected_asset_url"' in final_apk_check
      and "curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location --retry 3" in final_apk_check
      and '"$downloaded_size" == "$EXPECTED_SIZE"' in final_apk_check
      and 'sha256sum "$final_apk"' in final_apk_check
      and '"$downloaded_sha256" == "$EXPECTED_SHA256"' in final_apk_check
      and 'cmp -s "$APK_PATH" "$final_apk"' in final_apk_check,
      "the final public release APK must be re-downloaded and match release metadata, expected size/digest and attested bytes")

# Other privileged workflows retain their existing actor and environment guards.
check(OWNER_GATE in PRIVATE_MAIN_WORKFLOW,
      "the private main test APK workflow must retain its owner-only manual-dispatch gate")
production_job = PRODUCTION_RELEASE_WORKFLOW.split("  build-verify-draft:", 1)[1]
production_guard = " ".join(production_job.split("    runs-on:", 1)[0].split())
check("github.repository == 'AbrarulHaque8541/daymark'" in production_guard
      and "startsWith(github.ref, 'refs/tags/v')" in production_guard
      and OWNER_GATE in production_guard,
      "production release signing must remain restricted to owner-triggered version tags in this repository")
check("pull_request:" not in PRODUCTION_RELEASE_WORKFLOW
      and "workflow_dispatch:" not in PRODUCTION_RELEASE_WORKFLOW,
      "production release signing must remain push-tag-only")
check("environment: production-signing" in production_guard
      and "environment: production-signing" in signed_build
      and "environment: production-signing" in signed_publish,
      "all signed release jobs must use the protected production-signing environment")
private_job = PRIVATE_MAIN_WORKFLOW.split("private-main-test:", 1)[1]
check("environment: production-signing" in private_job,
      "private main signing must retain the protected production-signing environment")

print(f"PASS device-test provenance source checks: {checks} assertions")
