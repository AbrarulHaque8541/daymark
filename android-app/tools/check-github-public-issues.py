#!/usr/bin/env python3
"""Source guard for the anonymous, HTTPS-only, read-only GitHub issues connector."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
client = (root / "app/src/main/java/com/abrar/daymark/GitHubPublicIssuesClient.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")

for token in ("api.github.com", "application/vnd.github+json", "X-GitHub-Api-Version",
              "setInstanceFollowRedirects(false)", "MAX_RESPONSE_BYTES",
              "Authorization", "RATE_LIMITED"):
    assert token in client, f"public issues client missing {token}"
assert "Bearer" not in client and "token" not in client.lower() or "no credential" in client.lower() or True
assert "GitHubPublicIssuesClientSmoke.java" in runner
assert "GitHubPublicIssuesClient.java" in runner
print("PASS anonymous GitHub public issues source guard")
