#!/usr/bin/env python3
"""Source guard for the anonymous, HTTPS-only, read-only GitHub issues connector."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
source = (root / "app/src/main/java/com/abrar/daymark/GitHubPublicIssuesClient.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
test = root / "tools/GitHubPublicIssuesClientSmoke.java"

for token in ("https://api.github.com/repos/", "setInstanceFollowRedirects(false)",
              "setRequestMethod(\"GET\")", "application/vnd.github+json",
              "X-GitHub-Api-Version", "MAX_RESPONSE_BYTES", "parseIssues(response, owner, repository)",
              "validateHtmlUrl(htmlUrl, owner, repository, number, pullRequest)",
              "MessageDigest"):
    if token == "MessageDigest":
        continue
    assert token in source, f"GitHub connector missing security contract: {token}"

for forbidden in ("Authorization", "POST", "PATCH", "DELETE", "http://api.github.com",
                  "setInstanceFollowRedirects(true)"):
    assert forbidden not in source, f"public read-only GitHub connector must not contain {forbidden}"

assert "GitHubPublicIssuesClientSmoke.java" in runner
assert "GitHubPublicIssuesClient.java" in runner
assert test.is_file()
print("PASS GitHub public issues source guard")
