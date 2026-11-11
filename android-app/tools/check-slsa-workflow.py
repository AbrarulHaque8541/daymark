#!/usr/bin/env python3
"""Source-level guard against the SLSA workflow publishing fake provenance.

The round-2 audit found .github/workflows/generator-generic-ossf-slsa3-publish.yml
was still the untouched upstream template: it fabricated `artifact1` / `artifact2`
with `echo` and generated SLSA provenance for those fake files. This guard fails
if the template markers return or if the workflow stops hashing the real APK.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / ".github/workflows/generator-generic-ossf-slsa3-publish.yml").read_text()
checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


for marker in ('echo "artifact1" > artifact1', 'echo "artifact2" > artifact2',
               "These are some amazing artifacts", "files=$(ls artifact*)"):
    check(marker not in WORKFLOW,
          f"the SLSA workflow must not fabricate placeholder artifacts: {marker}")

check("assembleGithubSideloadDebug" in WORKFLOW,
      "the SLSA workflow must build the real githubSideload APK")
check("app-githubSideload-debug.apk" in WORKFLOW,
      "the provenance subject must be the real APK path")
check("sha256sum" in WORKFLOW and "base64 -w0" in WORKFLOW,
      "the provenance subject must be the base64 sha256 of the real APK")
check("base64-subjects" in WORKFLOW,
      "the generator must receive the real subject digests")



# Production signing and provenance are owner-triggered only. A tag-on-main check
# alone is not authorization: a repository writer must not be able to trigger
# production signing or release-asset writes merely by creating a matching tag.
SIGNED_RELEASE_WORKFLOW = (ROOT / ".github/workflows/android-signed-device-test-release.yml").read_text()
PRIVATE_MAIN_WORKFLOW = " ".join(
    (ROOT / ".github/workflows/android-private-main-test-apk.yml").read_text().split()
)
PRODUCTION_RELEASE_WORKFLOW = (ROOT / ".github/workflows/android-production-release.yml").read_text()
OWNER_GATE = "github.actor == 'AbrarulHaque8541' && github.triggering_actor == 'AbrarulHaque8541'"

signed_build = SIGNED_RELEASE_WORKFLOW.split("  build-and-verify:", 1)[1].split("  publish-release:", 1)[0]
signed_publish = SIGNED_RELEASE_WORKFLOW.split("  publish-release:", 1)[1]
slsa_build = WORKFLOW.split("  build:", 1)[1].split("  authorize-provenance:", 1)[0]
slsa_authorize = WORKFLOW.split("  authorize-provenance:", 1)[1].split("  provenance:", 1)[0]
slsa_provenance = WORKFLOW.split("  provenance:", 1)[1]

check(OWNER_GATE in signed_build,
      "production signing secrets must be reachable only from an owner-triggered tag run")
check(OWNER_GATE in signed_publish and "contents: write" in signed_publish,
      "production release-asset writes must require the owner actor gate")
check("pull_request:" not in SIGNED_RELEASE_WORKFLOW and "workflow_dispatch:" not in SIGNED_RELEASE_WORKFLOW,
      "the signed production workflow must remain tag-push-only")
check("github.event_name != 'push'" in slsa_build and OWNER_GATE in slsa_build,
      "SLSA manual dispatch may build only; tag-triggered APK builds must be owner-triggered")
check("github.event_name == 'push' && github.ref_type == 'tag'" in slsa_authorize
      and OWNER_GATE in slsa_authorize and "environment: production-signing" in slsa_authorize,
      "SLSA provenance must pass the owner-triggered protected-environment approval job")
check("needs: [build, authorize-provenance]" in slsa_provenance
      and "id-token: write" in slsa_provenance and "contents: write" in slsa_provenance,
      "SLSA signing/upload must depend on the approved gate before using OIDC/write permissions")
check("environment: production-signing" not in slsa_provenance,
      "the reusable SLSA workflow-call job must not declare unsupported job-level environment")
check(OWNER_GATE in PRIVATE_MAIN_WORKFLOW,
      "the private main test APK workflow must retain its owner-only manual-dispatch gate")
production_job = PRODUCTION_RELEASE_WORKFLOW.split("  build-verify-draft:", 1)[1]
production_guard = " ".join(production_job.split("    runs-on:", 1)[0].split())
check("github.repository == 'AbrarulHaque8541/daymark'" in production_guard
      and "startsWith(github.ref, 'refs/tags/v')" in production_guard
      and OWNER_GATE in production_guard,
      "production release signing must be restricted to owner-triggered version tags in this repository")
check("pull_request:" not in PRODUCTION_RELEASE_WORKFLOW
      and "workflow_dispatch:" not in PRODUCTION_RELEASE_WORKFLOW,
      "production release signing must remain push-tag-only")

# Every privileged signing/provenance job must reference the same environment.
private_job = PRIVATE_MAIN_WORKFLOW.split("private-main-test:", 1)[1]
check("environment: production-signing" in production_guard,
      "production release signing must wait on the protected production-signing environment")
check("environment: production-signing" in signed_build,
      "signed device-test signing must wait on the protected production-signing environment")
check("environment: production-signing" in signed_publish,
      "signed device-test release upload must wait on the protected production-signing environment")
check("environment: production-signing" in slsa_authorize,
      "SLSA provenance authorization must wait on the protected production-signing environment")
check("environment: production-signing" in private_job,
      "private main signing must wait on the protected production-signing environment")

print(f"PASS SLSA workflow source checks: {checks} assertions")
