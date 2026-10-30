#!/usr/bin/env python3
"""Prevent empty Gradle unit-test tasks and duplicate device-test release publishers."""
from pathlib import Path
import re
import sys

android_root = Path(sys.argv[1]).resolve()
repo_root = android_root.parent
workflow_dir = repo_root / ".github" / "workflows"
assert workflow_dir.is_dir(), f"workflow directory not found: {workflow_dir}"

unit_task = re.compile(r"\btest[A-Za-z0-9_]*UnitTest\b")
assert unit_task.search("testGithubSideloadDebugUnitTest"), "unit-test task detector self-test failed"

violations = []
for workflow in sorted(workflow_dir.glob("*.yml")):
    for line_number, line in enumerate(workflow.read_text(encoding="utf-8").splitlines(), 1):
        if line.lstrip().startswith("#"):
            continue
        if unit_task.search(line):
            violations.append(f"{workflow.name}:{line_number}: {line.strip()}")
assert not violations, (
    "Do not present NO-SOURCE Gradle unit-test tasks as CI gates. "
    "Use the canonical host/source checks and Android instrumentation instead:\n"
    + "\n".join(violations)
)

device_publishers = []
for workflow in sorted(workflow_dir.glob("*.yml")):
    content = workflow.read_text(encoding="utf-8")
    if "v*-device-test.*" in content and re.search(r"\bgh\s+release\s+(?:create|upload|edit)\b", content):
        device_publishers.append(workflow.name)
assert device_publishers == ["android-release-assets.yml"], (
    "android-release-assets.yml must be the only device-test tag release publisher; "
    f"found: {device_publishers}"
)
assert not (workflow_dir / "android-device-test-release.yml").exists(), (
    "retired duplicate android-device-test-release.yml must not be restored"
)

production = (workflow_dir / "android-production-release.yml").read_text(encoding="utf-8")
required = (
    "if: startsWith(github.ref, 'refs/tags/v') && !contains(github.ref_name, '-device-test.')",
    "name: Run exact-tag repository and Android source checks",
    "npm test",
    "sh android-app/tools/check-v1-source.sh",
    'release_notes="../docs/releases/v${VERSION_NAME}.md"',
    'cat "$release_notes"',
)
for token in required:
    assert token in production, f"production release workflow missing required gate: {token}"
assert production.index("Run exact-tag repository and Android source checks") < production.index("Validate signing secrets")
assert production.index("Validate signing secrets") < production.index("Build signed production APK and AAB")

print("PASS CI test honesty: no NO-SOURCE UnitTest gates, one device-test publisher, exact-tag source checks before signing, and version-specific release notes required")
