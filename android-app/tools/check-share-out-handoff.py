#!/usr/bin/env python3
"""Source guard for explicit Android Sharesheet task/attachment export."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
adapter = (root / "app/src/main/java/com/abrar/daymark/TaskShareHandoff.java").read_text(encoding="utf-8")
formatter = (root / "app/src/main/java/com/abrar/daymark/TaskShareText.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")

for token in ("Intent.ACTION_SEND", "Intent.ACTION_SEND_MULTIPLE", "Intent.EXTRA_STREAM",
              "ClipData", "Intent.FLAG_GRANT_READ_URI_PERMISSION",
              "AttachmentLogic.isSafeToOpenExternally", "store.exists(owned.id)",
              "findOwnedAttachment(task, candidate)", "share.setClipData(clip)"):
    assert token in adapter, f"outbound handoff missing {token}"
for forbidden in ("startActivity(", "takePersistableUriPermission", "file://", "READ_EXTERNAL_STORAGE"):
    assert forbidden not in adapter, f"handoff must remain user-launched and URI-grant-only: {forbidden}"
assert "includeNotes" in formatter and "16_384" in formatter
assert "TaskShareTextSmoke.java" in runner and "TaskShareText.java" in runner
print("PASS outbound Android share handoff source guard")
