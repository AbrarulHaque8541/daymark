package com.abrar.daymark;

/** Small, deterministic policy for file batches received from other Android apps. */
final class SharedAttachmentPolicy {
    static final int MAX_FILES = AttachmentLogic.MAX_PER_TASK;

    private SharedAttachmentPolicy() { }

    static boolean isSupportedUriScheme(String scheme) {
        return scheme != null && "content".equalsIgnoreCase(scheme);
    }

    static boolean isValidBatchSize(int count) {
        return count > 0 && count <= MAX_FILES;
    }

    static String defaultTaskTitle(int count) {
        return count == 1 ? "Shared attachment" : "Shared files (" + count + ")";
    }
}
