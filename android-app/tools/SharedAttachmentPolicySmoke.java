package com.abrar.daymark;

/** Host-side regression checks for inbound app-to-Daymark attachment policy. */
public final class SharedAttachmentPolicySmoke {
    public static void main(String[] args) {
        check(SharedAttachmentPolicy.MAX_FILES == AttachmentLogic.MAX_PER_TASK,
                "share batch cap must match the encrypted task attachment cap");
        check(SharedAttachmentPolicy.isSupportedUriScheme("content"),
                "content provider URIs are accepted");
        check(SharedAttachmentPolicy.isSupportedUriScheme("CONTENT"),
                "content URI scheme matching is case-insensitive");
        check(!SharedAttachmentPolicy.isSupportedUriScheme("file"),
                "raw filesystem paths are never accepted");
        check(!SharedAttachmentPolicy.isSupportedUriScheme("https"),
                "remote URLs are not treated as local file attachments");
        check(!SharedAttachmentPolicy.isSupportedUriScheme(null),
                "missing URI schemes fail closed");
        check(!SharedAttachmentPolicy.isValidBatchSize(0),
                "empty batches are not valid attachment shares");
        check(SharedAttachmentPolicy.isValidBatchSize(1),
                "one attachment is accepted");
        check(SharedAttachmentPolicy.isValidBatchSize(AttachmentLogic.MAX_PER_TASK),
                "the maximum supported per-task batch is accepted");
        check(!SharedAttachmentPolicy.isValidBatchSize(AttachmentLogic.MAX_PER_TASK + 1),
                "oversized batches are rejected rather than silently truncated");
        check("Shared attachment".equals(SharedAttachmentPolicy.defaultTaskTitle(1)),
                "single-file shares receive a useful editable title");
        check("Shared files (3)".equals(SharedAttachmentPolicy.defaultTaskTitle(3)),
                "multi-file shares receive a count-aware editable title");
        System.out.println("PASS shared attachment policy");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
