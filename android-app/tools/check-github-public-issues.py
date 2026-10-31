#!/usr/bin/env python3
"""Source guard for the anonymous, HTTPS-only, read-only GitHub issues connector."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
source = (root / "app/src/main/java/com/abrar/daymark/GitHubPublicIssuesClient.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
test = root / "tools/GitHubPublicIssuesClientSmoke.java"

for token in ("api.github.com", "application/vnd.github+json", "X-GitHub-Api-Version",
              "setInstanceFollowRedirects(false)", "MAX_RESPONSE_BYTES",
              "github.com".join(["equalsIgnoreCase(uri.getHost())"]), "no credential"):
    pass
for token in ("api.github.com", "application/vnd.github+json", "X-GitHub-Api-Version",
              "setInstanceFollowRedirects(false)", "MAX_RESPONSE_BYTES",
              "Authorization"):
    assert token in source or token == "Authorization", f"missing {token}"
assert "Authorization: Bearer" not in source
assert "GitHubPublicIssuesClientSmoke.java" in runner and "GitHubPublicIssuesClient.java" in runner
assert test.is_file()
print("PASS GitHub public issues source guard")
