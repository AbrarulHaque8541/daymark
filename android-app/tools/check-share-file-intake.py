#!/usr/bin/env python3
"""Source-level contract for inbound Android share/file attachment handling."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve()
main = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
manifest = (root / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
policy = (root / "app/src/main/java/com/abrar/daymark/SharedAttachmentPolicy.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
smoke = root / "tools/SharedAttachmentPolicySmoke.java"

def region(source: str, start: str, end: str, label: str) -> str:
    parts = source.split(start, 1)
    assert len(parts) == 2 and end in parts[1], f"cannot locate {label}"
    return parts[1].split(end, 1)[0]

share = region(main, "private void handleShareInIntent", "private List<Uri> collectSharedAttachmentUris",
               "share handler")
for token in ("Intent.ACTION_SEND.equals(intent.getAction())", "Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())",
              "Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())", "collectSharedAttachmentUris(intent, send, sendMultiple)",
              "intent.removeExtra(Intent.EXTRA_STREAM);", "intent.setClipData(null);",
              "stagedSharedAttachmentUris.addAll(sharedUris)", "dispatchPendingSharedTaskEditor()"):
    assert token in share, f"share handler missing {token}"

collector = region(main, "private List<Uri> collectSharedAttachmentUris",
                   "private void dispatchPendingSharedTaskEditor", "URI collector")
for token in ("intent.getClipData()", "Intent.EXTRA_STREAM", "getParcelableArrayListExtra",
              "SharedAttachmentPolicy.isSupportedUriScheme(uri.getScheme())", "result.contains(uri)"):
    assert token in collector, f"URI collector missing {token}"
assert "takePersistableUriPermission" not in collector, "transient share grants must not be persisted"
assert "file".lower() not in policy.split("isSupportedUriScheme", 1)[1].split("}", 1)[0].lower() or \
       '"content".equalsIgnoreCase(scheme)' in policy, "only content URI sources may be accepted"
assert "MAX_FILES = AttachmentLogic.MAX_PER_TASK" in policy
assert "count <= MAX_FILES" in policy, "oversized batches must fail closed, not truncate"
assert "defaultTaskTitle" in policy

save = region(main, "private void saveTaskFromEditor", "private void showDatePicker", "task editor save")
assert "pendingSharedAttachmentUris.addAll(stagedSharedAttachmentUris)" in save
assert "stagedSharedAttachmentUris.clear();" in save
assert "pendingSharedAttachmentTaskId = created.id;" in save
assert save.index("saveTasksAsync();") < save.index("importNextSharedAttachment();"), \
    "task snapshot must be queued before attachment import"

queue = region(main, "private void importNextSharedAttachment", "private void clearPendingSharedAttachments",
               "shared attachment queue")
assert "AttachmentLogic.canAddToTask(target, tasks)" in queue
assert "importAttachment(pendingSharedAttachmentTaskId, next);" in queue
importer = region(main, "private void importAttachment", "private void requestAttachmentCancel",
                  "encrypted attachment importer")
assert "attachmentStore.importSelected(" in importer
assert "pendingSharedAttachmentIndex++;" in importer, "batch advances only after a successful encrypted commit"
assert "clearPendingSharedAttachments();" in importer, "failed/ambiguous imports must stop the batch"

editor = region(main, "AlertDialog dialog = editorBuilder.create();", "dialog.setOnShowListener",
                "task editor dialog")
assert "dialog.setOnDismissListener" in editor
assert "stagedSharedAttachmentUris.clear();" in editor, "cancelling the editor must discard only staged grants"

saved = region(main, "protected void onSaveInstanceState", "protected void onActivityResult",
               "activity saved state")
assert "STATE_SHARED_ATTACHMENT_URIS" in saved
assert "STATE_SHARED_TASK_TITLE" in saved and "STATE_SHARED_TASK_NOTES" in saved
assert "outState.putParcelableArrayList" in saved

assert 'android:name="android.intent.action.SEND_MULTIPLE"' in manifest
assert 'android:mimeType="*/*"' in manifest
assert 'android:name="android.intent.action.SEND"' in manifest
assert smoke.is_file() and "SharedAttachmentPolicySmoke.java" in runner
assert "SharedAttachmentPolicy.java" in runner
print("PASS inbound Android share/file attachment source contract")
