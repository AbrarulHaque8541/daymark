package com.abrar.daymark;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * User-initiated Android Sharesheet handoff for task text and safe attachment payloads.
 * The caller must show the returned intent in a chooser; this class never launches another app.
 */
final class TaskShareHandoff {
    private TaskShareHandoff() { }

    static Intent createTaskTextIntent(Task task, boolean includeNotes) {
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_SUBJECT, task == null ? "" : task.title);
        share.putExtra(Intent.EXTRA_TEXT, TaskShareText.compose(task, includeNotes));
        return share;
    }

    static Intent createAttachmentIntent(String authority, Task task,
                                          List<AttachmentRef> selected,
                                          AndroidAttachmentStore store) {
        if (authority == null || authority.trim().isEmpty() || authority.contains("/")
                || task == null || selected == null || selected.isEmpty()
                || selected.size() > AttachmentLogic.MAX_PER_TASK || store == null) {
            throw new IllegalArgumentException("Select one or more valid task attachments.");
        }

        List<Uri> uris = new ArrayList<>();
        List<String> mimeTypes = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (AttachmentRef candidate : selected) {
            AttachmentRef owned = findOwnedAttachment(task, candidate);
            if (owned == null || !AttachmentLogic.isSafeToOpenExternally(owned)
                    || !store.exists(owned.id) || !seen.add(owned.id)) {
                throw new IllegalArgumentException("One or more selected files are unavailable or unsafe to share.");
            }
            Uri uri = new Uri.Builder().scheme("content").authority(authority)
                    .appendPath(owned.id).build();
            uris.add(uri);
            mimeTypes.add(owned.mimeType);
        }

        String intentType = commonShareType(mimeTypes);
        Intent share = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
        share.setType(intentType);
        share.putExtra(Intent.EXTRA_SUBJECT, task.title == null ? "" : task.title);
        share.putExtra(Intent.EXTRA_TEXT, TaskShareText.compose(task, false));
        if (uris.size() == 1) {
            share.putExtra(Intent.EXTRA_STREAM, uris.get(0));
        } else {
            share.putParcelableArrayListExtra(Intent.EXTRA_STREAM, new ArrayList<>(uris));
        }

        ClipData clip = new ClipData("Daymark attachments", mimeTypes.toArray(new String[0]),
                new ClipData.Item(uris.get(0)));
        for (int index = 1; index < uris.size(); index++) {
            clip.addItem(new ClipData.Item(uris.get(index)));
        }
        share.setClipData(clip);
        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return share;
    }

    private static AttachmentRef findOwnedAttachment(Task task, AttachmentRef selected) {
        if (selected == null || task.attachments == null) return null;
        for (AttachmentRef owned : task.attachments) {
            if (owned != null && owned.id.equals(selected.id)
                    && owned.displayName.equals(selected.displayName)
                    && owned.mimeType.equals(selected.mimeType)
                    && owned.sizeBytes == selected.sizeBytes) return owned;
        }
        return null;
    }

    private static String commonShareType(List<String> mimeTypes) {
        if (mimeTypes.size() == 1) return mimeTypes.get(0);
        String topLevel = null;
        for (String mime : mimeTypes) {
            int slash = mime.indexOf('/');
            if (slash <= 0) return "*/*";
            String candidate = mime.substring(0, slash);
            if (topLevel == null) topLevel = candidate;
            else if (!topLevel.equals(candidate)) return "*/*";
        }
        return topLevel == null ? "*/*" : topLevel + "/*";
    }
}
