#!/usr/bin/env python3
"""Fail if workflows reintroduce vacuous Gradle unit-test tasks or drop host suites."""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"

FORBIDDEN_UNIT_TASKS = (
    "testGithubSideloadDebugUnitTest",
    "testGithubSideloadReleaseUnitTest",
    "testPlayDebugUnitTest",
    "testPlayReleaseUnitTest",
)

REQUIRED_HOST_MARKERS = (
    "check-v1-source.sh",
    "run-core-tests.sh",
)


def main() -> int:
    if not WORKFLOWS.is_dir():
        print("FAIL: .github/workflows missing", file=sys.stderr)
        return 1

    failures: list[str] = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        text = path.read_text(encoding="utf-8")
        for task in FORBIDDEN_UNIT_TASKS:
            if task in text:
                failures.append(f"{path.name}: forbidden vacuous task {task}")

    prod = WORKFLOWS / "android-production-release.yml"
    if prod.is_file():
        text = prod.read_text(encoding="utf-8")
        for marker in REQUIRED_HOST_MARKERS:
            if marker not in text:
                failures.append(
                    f"android-production-release.yml: missing required host suite marker {marker}"
                )

    if failures:
        print("FAIL: CI test honesty violations:")
        for item in failures:
            print(f"  - {item}")
        return 1

    print("PASS: no vacuous unit-test tasks; production host suite markers present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
