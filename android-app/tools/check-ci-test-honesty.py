#!/usr/bin/env python3
"""Guard: fail if any workflow reintroduces vacuous test*UnitTest tasks.

The app module has no src/test sources, so test*UnitTest tasks pass vacuously.
This guard fails if:
1. Any .github/workflows/*.yml references a test*UnitTest Gradle task.
2. A gated workflow drops the host source-check suite.
3. The production release workflow stops running source checks before signing.
"""
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
workflows = sorted((root / ".github" / "workflows").glob("*.yml"))
assert workflows, "no workflow files found"

UNIT_TEST_RE = re.compile(r"test[A-Za-z]+UnitTest\b")

failures = []
for wf in workflows:
    text = wf.read_text(encoding="utf-8")
    for i, line in enumerate(text.splitlines(), 1):
        if UNIT_TEST_RE.search(line):
            failures.append(f"{wf.name}:{i}: vacuous unit-test task reference: {line.strip()}")

# Production release must run source checks before signing
prod = root / ".github" / "workflows" / "android-production-release.yml"
if prod.exists():
    text = prod.read_text(encoding="utf-8")
    if "check-v1-source.sh" not in text:
        failures.append("android-production-release.yml: missing check-v1-source.sh before signing")
    src_idx = text.find("check-v1-source.sh")
    keystore_idx = text.find("KEYSTORE_BASE64")
    if src_idx != -1 and keystore_idx != -1 and src_idx > keystore_idx:
        failures.append("android-production-release.yml: source checks must run BEFORE keystore restore/signing")

# Main CI workflow must run the host suite
main_ci = root / ".github" / "workflows" / "android.yml"
if main_ci.exists():
    text = main_ci.read_text(encoding="utf-8")
    if "check-v1-source.sh" not in text:
        failures.append("android.yml: missing check-v1-source.sh host regression checks")

if failures:
    for f in failures:
        print(f"FAIL: {f}", file=sys.stderr)
    sys.exit(1)

print(f"PASS ci-test-honesty: {len(workflows)} workflows checked, no vacuous test*UnitTest tasks, source checks present in gated workflows")
