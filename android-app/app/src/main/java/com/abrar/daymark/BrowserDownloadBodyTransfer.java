package com.abrar.daymark;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;

/**
 * Bounded, fail-closed response-body transfer for the browser download transport.
 *
 * <p>The caller must validate the redirect chain and response destination before calling this
 * helper. It must also close the active network connection when cancellation is requested or
 * the user switches the browser to Offline.
 * This class never publishes a destination itself: {@link StagingTarget#commit(long)} is called
 * only after the complete body has been copied, length-checked, flushed, and closed. A target
 * implementation must make commit atomic and make abort idempotently remove unpublished data.
 *
 * <p>Do not log response headers, URLs, cookies, or exception causes from the surrounding
 * transport. TransferException deliberately exposes only a bounded failure category.
 */
final class BrowserDownloadBodyTransfer {
    static final long HARD_MAX_BYTES = 1024L * 1024L * 1024L;
    static final int BUFFER_BYTES = 16 * 1024;

    enum Failure {
        INVALID_ARGUMENT,
        HTTP_STATUS,
        INVALID_CONTENT_LENGTH,
        CONTENT_TOO_LARGE,
        UNSUPPORTED_CONTENT_ENCODING,
        CANCELLED,
        NETWORK_DISABLED,
        BODY_EXCEEDS_DECLARED_LENGTH,
        BODY_LENGTH_MISMATCH,
        IO_ERROR,
        CLEANUP_FAILED
    }

    static final class TransferException extends Exception {
        private static final long serialVersionUID = 1L;
        final Failure failure;

        TransferException(Failure failure) {
            super("Browser download body transfer failed: " + failure.name());
            this.failure = failure;
        }
    }

    interface Cancellation {
        boolean isCancelled();
    }

    interface NetworkPolicy {
        boolean isOnline();
    }

    interface ProgressListener {
        void onProgress(long copiedBytes, long expectedBytes);
    }

    interface StagingTarget {
        OutputStream openStream() throws IOException;
        void commit(long copiedBytes) throws IOException;
        void abort() throws IOException;
    }

    private BrowserDownloadBodyTransfer() { }

    /**
     * Copies one already-validated HTTP 200 response into an unpublished staging target.
     *
     * @param contentLengthValues all Content-Length values returned by the HTTP stack; null or
     *                            empty means the length is unknown. Ambiguous duplicates fail.
     * @param contentEncodingValues all Content-Encoding values; only absent or identity is safe
     *                              because the byte limit applies to the received representation.
     * @param configuredMaxBytes caller-selected limit, capped by {@link #HARD_MAX_BYTES}
     * @return exact number of bytes copied and committed
     */
    static long copy(int statusCode, List<String> contentLengthValues,
                     List<String> contentEncodingValues, InputStream input,
                     long configuredMaxBytes, Cancellation cancellation,
                     NetworkPolicy networkPolicy, ProgressListener progress,
                     StagingTarget target) throws TransferException {
        boolean committed = false;
        long copied = 0L;
        // The transfer takes ownership of the response stream, including early validation failures.
        try (InputStream source = input) {
            if (statusCode != 200) throw failure(Failure.HTTP_STATUS);
            if (source == null || cancellation == null || networkPolicy == null || target == null
                    || configuredMaxBytes <= 0L) {
                throw failure(Failure.INVALID_ARGUMENT);
            }
            long maxBytes = Math.min(configuredMaxBytes, HARD_MAX_BYTES);
            long expectedBytes = parseContentLength(contentLengthValues);
            if (expectedBytes > maxBytes) throw failure(Failure.CONTENT_TOO_LARGE);
            requireIdentityEncoding(contentEncodingValues);
            checkState(cancellation, networkPolicy);

            OutputStream output = target.openStream();
            if (output == null) throw failure(Failure.IO_ERROR);
            try (OutputStream sink = output) {
                byte[] buffer = new byte[BUFFER_BYTES];
                while (true) {
                    checkState(cancellation, networkPolicy);
                    int count = source.read(buffer);
                    if (count < 0) break;
                    if (count == 0) {
                        int one = source.read();
                        if (one < 0) break;
                        buffer[0] = (byte) one;
                        count = 1;
                    }
                    if (copied > maxBytes - count) throw failure(Failure.CONTENT_TOO_LARGE);
                    if (expectedBytes >= 0L && copied > expectedBytes - count) {
                        throw failure(Failure.BODY_EXCEEDS_DECLARED_LENGTH);
                    }
                    sink.write(buffer, 0, count);
                    copied += count;
                    if (progress != null) {
                        try {
                            progress.onProgress(copied, expectedBytes);
                        } catch (RuntimeException ignored) {
                            // UI progress must not interrupt an otherwise safe transfer.
                        }
                    }
                }
                if (expectedBytes >= 0L && copied != expectedBytes) {
                    throw failure(Failure.BODY_LENGTH_MISMATCH);
                }
                sink.flush();
            }
        } catch (TransferException failure) {
            abortAfterFailure(target, committed);
            throw failure;
        } catch (IOException | RuntimeException failure) {
            abortAfterFailure(target, committed);
            throw failure(Failure.IO_ERROR);
        }
        try {
            checkState(cancellation, networkPolicy);
            target.commit(copied);
            committed = true;
            return copied;
        } catch (TransferException failure) {
            abortAfterFailure(target, committed);
            throw failure;
        } catch (IOException | RuntimeException failure) {
            abortAfterFailure(target, committed);
            throw failure(Failure.IO_ERROR);
        }
    }

    private static long parseContentLength(List<String> values) throws TransferException {
        if (values == null || values.isEmpty()) return -1L;
        if (values.size() != 1 || values.get(0) == null) {
            throw failure(Failure.INVALID_CONTENT_LENGTH);
        }
        String value = trimHttpWhitespace(values.get(0));
        if (value.isEmpty()) throw failure(Failure.INVALID_CONTENT_LENGTH);
        long parsed = 0L;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < '0' || c > '9') throw failure(Failure.INVALID_CONTENT_LENGTH);
            int digit = c - '0';
            if (parsed > (Long.MAX_VALUE - digit) / 10L) {
                throw failure(Failure.INVALID_CONTENT_LENGTH);
            }
            parsed = parsed * 10L + digit;
        }
        return parsed;
    }

    private static void requireIdentityEncoding(List<String> values) throws TransferException {
        if (values == null || values.isEmpty()) return;
        if (values.size() != 1 || values.get(0) == null
                || !"identity".equals(trimHttpWhitespace(values.get(0)).toLowerCase(Locale.ROOT))) {
            throw failure(Failure.UNSUPPORTED_CONTENT_ENCODING);
        }
    }

    private static String trimHttpWhitespace(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && (value.charAt(start) == ' ' || value.charAt(start) == '\t')) start++;
        while (end > start && (value.charAt(end - 1) == ' ' || value.charAt(end - 1) == '\t')) end--;
        return value.substring(start, end);
    }

    private static void checkState(Cancellation cancellation, NetworkPolicy networkPolicy)
            throws TransferException {
        if (cancellation.isCancelled()) throw failure(Failure.CANCELLED);
        if (!networkPolicy.isOnline()) throw failure(Failure.NETWORK_DISABLED);
    }

    private static void abortAfterFailure(StagingTarget target, boolean committed)
            throws TransferException {
        if (committed || target == null) return;
        // Abort even when openStream failed: implementations may have created a temp entry first.
        try {
            target.abort();
        } catch (IOException | RuntimeException cleanupFailure) {
            throw failure(Failure.CLEANUP_FAILED);
        }
    }

    private static TransferException failure(Failure failure) {
        return new TransferException(failure);
    }
}
