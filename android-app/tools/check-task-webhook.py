#!/usr/bin/env python3
"""Source guard for opt-in HTTPS webhook transport and minimal task payloads."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
client = (root / "app/src/main/java/com/abrar/daymark/TaskWebhookClient.java").read_text(encoding="utf-8")
payload = (root / "app/src/main/java/com/abrar/daymark/TaskWebhookPayload.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")

for token in ("HttpsURLConnection", "validateEndpoint(endpoint)", "setRequestMethod(\"POST\")",
              "setInstanceFollowRedirects(false)", "setConnectTimeout", "setReadTimeout",
              "MAX_RESPONSE_BYTES", "setRequestProperty(\"Cache-Control\", \"no-store\")",
              "No automatic retry was attempted"):
    assert token in client, f"webhook client missing security contract: {token}"
for forbidden in ("http://", "Authorization", "Cookie", "SharedPreferences", "Log.", "setInstanceFollowRedirects(true)"):
    assert forbidden not in client, f"webhook client must not use {forbidden}"
for token in ("MAX_PAYLOAD_CHARS", "includeNotes", "daymark.task.shared", "completed"):
    assert token in payload, f"webhook payload missing {token}"
assert "secret-internal-id" not in payload, "internal task IDs must never be exported"
assert "TaskWebhookClientSmoke.java" in runner and "TaskWebhookClient.java" in runner
print("PASS HTTPS webhook source guard")
