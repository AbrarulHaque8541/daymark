package com.abrar.daymark;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Deterministic host regressions for bounded, unpublished browser-download body transfers. */
public final class BrowserDownloadBodyTransferSmoke {
    private static int assertions;

    private BrowserDownloadBodyTransferSmoke() { }

    public static void main(String[] args) throws Exception {
        validKnownLengthCommitsOnlyAfterClose();
        unknownLengthIsBoundedAndCanCommit();
        rejectsInvalidOrAmbiguousHeadersBeforeOpeningTarget();
        rejectsNonIdentityEncodingAndNonSuccessStatus();
        rejectsTruncatedAndOverlongBodies();
        interruptedAndStorageFailuresAbort();
        cancellationAndOfflineTransitionsAbort();
        sinkFailuresAbortAndDoNotPublish();
        progressCallbacksCannotBreakTransfers();
        zeroLengthBodyIsValid();
        System.out.println("PASS browser download body transfer: " + assertions + " assertions");
    }

    private static void validKnownLengthCommitsOnlyAfterClose() throws Exception {
        byte[] bytes = "verified body".getBytes(StandardCharsets.UTF_8);
        Target target = new Target();
        long copied = transfer(200, Collections.singletonList(" " + bytes.length + "\t"),
                Collections.singletonList("identity"), new ByteArrayInputStream(bytes), 1024,
                () -> false, () -> true, target, null);
        check(copied == bytes.length, "known-length transfer returns the exact byte count");
        check(Arrays.equals(bytes, target.bytes.toByteArray()), "known-length transfer writes exact bytes");
        check(target.commits == 1 && target.committedBytes == bytes.length,
                "known-length transfer commits once after the full body");
        check(target.aborts == 0 && target.closedBeforeCommit,
                "successful transfer closes staging output before publication");
    }

    private static void unknownLengthIsBoundedAndCanCommit() throws Exception {
        byte[] bytes = new byte[1024];
        Arrays.fill(bytes, (byte) 7);
        Target target = new Target();
        long copied = transfer(200, null, null, new ByteArrayInputStream(bytes), 2048,
                () -> false, () -> true, target, null);
        check(copied == 1024 && target.commits == 1,
                "unknown-length identity response commits when EOF occurs within the byte cap");
        check(target.committedBytes == 1024, "unknown-length publication records exact bytes");
    }

    private static void rejectsInvalidOrAmbiguousHeadersBeforeOpeningTarget() throws Exception {
        for (List<String> values : Arrays.asList(
                Collections.singletonList(""), Collections.singletonList("-1"),
                Collections.singletonList("+1"), Collections.singletonList("1, 1"),
                Collections.singletonList("9223372036854775808"),
                Arrays.asList("1", "1"))) {
            Target target = new Target();
            expect(BrowserDownloadBodyTransfer.Failure.INVALID_CONTENT_LENGTH, () -> transfer(200, values, null,
                    new ByteArrayInputStream(new byte[]{1}), 1024, () -> false, () -> true, target, null));
            check(target.opens == 0 && target.commits == 0 && target.aborts == 1,
                    "invalid Content-Length is rejected before opening and aborts the unpublished target");
        }
        Target earlyFailure = new Target();
        TrackingInputStream earlyInput = new TrackingInputStream(new byte[]{1});
        expect(BrowserDownloadBodyTransfer.Failure.INVALID_CONTENT_LENGTH, () -> transfer(200,
                Collections.singletonList("not-a-length"), null, earlyInput, 1024,
                () -> false, () -> true, earlyFailure, null));
        check(earlyInput.closed && earlyFailure.opens == 0,
                "response stream is closed even when headers fail before staging begins");
        Target oversized = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.CONTENT_TOO_LARGE, () -> transfer(200, Collections.singletonList("2049"), null,
                new ByteArrayInputStream(new byte[0]), 1024, () -> false, () -> true, oversized, null));
        check(oversized.opens == 0 && oversized.commits == 0,
                "oversized declared Content-Length is rejected before staging begins");
    }

    private static void rejectsNonIdentityEncodingAndNonSuccessStatus() throws Exception {
        Target compressed = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.UNSUPPORTED_CONTENT_ENCODING, () -> transfer(200, null,
                Collections.singletonList("gzip"), new ByteArrayInputStream(new byte[0]), 1024,
                () -> false, () -> true, compressed, null));
        check(compressed.opens == 0 && compressed.commits == 0,
                "compressed representations are rejected before staging");
        Target duplicateEncoding = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.UNSUPPORTED_CONTENT_ENCODING, () -> transfer(200, null,
                Arrays.asList("identity", "identity"), new ByteArrayInputStream(new byte[0]), 1024,
                () -> false, () -> true, duplicateEncoding, null));
        Target partial = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.HTTP_STATUS, () -> transfer(206, null, null,
                new ByteArrayInputStream(new byte[0]), 1024, () -> false, () -> true, partial, null));
        check(partial.opens == 0 && partial.commits == 0,
                "unexpected HTTP status never publishes a partial or range response");
    }

    private static void rejectsTruncatedAndOverlongBodies() throws Exception {
        Target truncated = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.BODY_LENGTH_MISMATCH, () -> transfer(200, Collections.singletonList("5"), null,
                new ByteArrayInputStream(new byte[]{1, 2, 3}), 1024, () -> false, () -> true, truncated, null));
        check(truncated.commits == 0 && truncated.aborts == 1,
                "truncated response is aborted and never committed");

        Target longer = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.BODY_EXCEEDS_DECLARED_LENGTH, () -> transfer(200, Collections.singletonList("2"), null,
                new ByteArrayInputStream(new byte[]{1, 2, 3}), 1024, () -> false, () -> true, longer, null));
        check(longer.commits == 0 && longer.aborts == 1,
                "body exceeding declared length is aborted before publication");

        Target cap = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.CONTENT_TOO_LARGE, () -> transfer(200, null, null,
                new ByteArrayInputStream(new byte[1025]), 1024, () -> false, () -> true, cap, null));
        check(cap.commits == 0 && cap.aborts == 1,
                "unknown-length body exceeding configured cap is aborted");
    }

    private static void interruptedAndStorageFailuresAbort() throws Exception {
        Target interrupted = new Target();
        InputStream broken = new InputStream() {
            private boolean sent;
            @Override public int read() throws IOException {
                if (!sent) { sent = true; return 1; }
                throw new IOException("synthetic interrupted response");
            }
            @Override public int read(byte[] buffer, int offset, int length) throws IOException {
                if (!sent) { sent = true; buffer[offset] = 1; return 1; }
                throw new IOException("synthetic interrupted response");
            }
        };
        expect(BrowserDownloadBodyTransfer.Failure.IO_ERROR, () -> transfer(200, null, null, broken, 1024,
                () -> false, () -> true, interrupted, null));
        check(interrupted.commits == 0 && interrupted.aborts == 1,
                "interrupted response stream aborts the partial staging target");

        Target diskFull = new Target();
        diskFull.failWrite = true;
        expect(BrowserDownloadBodyTransfer.Failure.IO_ERROR, () -> transfer(200, null, null,
                new ByteArrayInputStream(new byte[]{1, 2, 3}), 1024, () -> false, () -> true, diskFull, null));
        check(diskFull.commits == 0 && diskFull.aborts == 1,
                "staging write failure aborts and never publishes the partial file");
    }

    private static void cancellationAndOfflineTransitionsAbort() throws Exception {
        byte[] bytes = new byte[BrowserDownloadBodyTransfer.BUFFER_BYTES * 2];
        Target cancelled = new Target();
        boolean[] cancel = {false};
        expect(BrowserDownloadBodyTransfer.Failure.CANCELLED, () -> transfer(200, null, null, new ByteArrayInputStream(bytes), 65536,
                () -> cancel[0], () -> true, cancelled, (copied, expected) -> cancel[0] = true));
        check(cancelled.commits == 0 && cancelled.aborts == 1,
                "cancellation between chunks aborts and never publishes");

        Target offline = new Target();
        boolean[] online = {true};
        expect(BrowserDownloadBodyTransfer.Failure.NETWORK_DISABLED, () -> transfer(200, null, null, new ByteArrayInputStream(bytes), 65536,
                () -> false, () -> online[0], offline, (copied, expected) -> online[0] = false));
        check(offline.commits == 0 && offline.aborts == 1,
                "Offline transition between chunks aborts and never publishes");

        Target preCancelled = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.CANCELLED, () -> transfer(200, null, null, new ByteArrayInputStream(bytes), 65536,
                () -> true, () -> true, preCancelled, null));
        check(preCancelled.opens == 0 && preCancelled.aborts == 1,
                "pre-cancelled transfer never opens a staging stream");

        Target preOffline = new Target();
        expect(BrowserDownloadBodyTransfer.Failure.NETWORK_DISABLED, () -> transfer(200, null, null, new ByteArrayInputStream(bytes), 65536,
                () -> false, () -> false, preOffline, null));
        check(preOffline.opens == 0 && preOffline.aborts == 1,
                "Offline policy is checked before opening a staging stream");
    }

    private static void sinkFailuresAbortAndDoNotPublish() throws Exception {
        Target openFailure = new Target();
        openFailure.failOpen = true;
        expect(BrowserDownloadBodyTransfer.Failure.IO_ERROR, () -> transfer(200, null, null, new ByteArrayInputStream(new byte[]{1}), 1024,
                () -> false, () -> true, openFailure, null));
        check(openFailure.commits == 0 && openFailure.aborts == 1,
                "staging-open failure invokes cleanup and never commits");

        Target commitFailure = new Target();
        commitFailure.failCommit = true;
        expect(BrowserDownloadBodyTransfer.Failure.IO_ERROR, () -> transfer(200, Collections.singletonList("1"), null,
                new ByteArrayInputStream(new byte[]{1}), 1024, () -> false, () -> true, commitFailure, null));
        check(commitFailure.commits == 1 && commitFailure.aborts == 1,
                "atomic publication failure invokes abort cleanup");

        Target cleanupFailure = new Target();
        cleanupFailure.failOpen = true;
        cleanupFailure.failAbort = true;
        expect(BrowserDownloadBodyTransfer.Failure.CLEANUP_FAILED, () -> transfer(200, null, null,
                new ByteArrayInputStream(new byte[0]), 1024, () -> false, () -> true, cleanupFailure, null));
        check(cleanupFailure.commits == 0, "cleanup failure never becomes a successful publication");
    }

    private static void progressCallbacksCannotBreakTransfers() throws Exception {
        Target target = new Target();
        long copied = transfer(200, null, null, new ByteArrayInputStream(new byte[]{1, 2, 3}), 1024,
                () -> false, () -> true, target, (count, expected) -> { throw new IllegalStateException("UI failure"); });
        check(copied == 3 && target.commits == 1,
                "progress-listener exceptions do not interrupt a safe transfer");
    }

    private static void zeroLengthBodyIsValid() throws Exception {
        Target target = new Target();
        long copied = transfer(200, Collections.singletonList("0"), null,
                new ByteArrayInputStream(new byte[0]), 1024, () -> false, () -> true, target, null);
        check(copied == 0 && target.commits == 1 && target.aborts == 0,
                "explicit zero-length body can be committed as a complete empty file");
    }

    private static long transfer(int status, List<String> length, List<String> encoding,
                                  InputStream input, long maxBytes,
                                  BrowserDownloadBodyTransfer.Cancellation cancellation,
                                  BrowserDownloadBodyTransfer.NetworkPolicy network,
                                  Target target, BrowserDownloadBodyTransfer.ProgressListener progress)
            throws TransferFailure {
        try {
            return BrowserDownloadBodyTransfer.copy(status, length, encoding, input, maxBytes,
                    cancellation, network, progress, target);
        } catch (BrowserDownloadBodyTransfer.TransferException exception) {
            throw new TransferFailure(exception.failure);
        }
    }

    private static void expect(BrowserDownloadBodyTransfer.Failure expected, Throwing operation) throws Exception {
        assertions++;
        try {
            operation.run();
            throw new AssertionError("expected transfer failure " + expected);
        } catch (TransferFailure actual) {
            if (actual.failure != expected) throw new AssertionError("expected " + expected + " but got " + actual.failure);
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private interface Throwing { void run() throws Exception; }

    private static final class TransferFailure extends Exception {
        private static final long serialVersionUID = 1L;
        final BrowserDownloadBodyTransfer.Failure failure;
        TransferFailure(BrowserDownloadBodyTransfer.Failure failure) { this.failure = failure; }
    }

    private static final class TrackingInputStream extends ByteArrayInputStream {
        boolean closed;
        TrackingInputStream(byte[] bytes) { super(bytes); }
        @Override public void close() throws IOException { closed = true; super.close(); }
    }

    private static final class Target implements BrowserDownloadBodyTransfer.StagingTarget {
        final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int opens;
        int commits;
        int aborts;
        long committedBytes = -1L;
        boolean closed;
        boolean closedBeforeCommit;
        boolean failOpen;
        boolean failCommit;
        boolean failAbort;
        boolean failWrite;

        @Override public OutputStream openStream() throws IOException {
            opens++;
            if (failOpen) throw new IOException("synthetic open failure");
            return new OutputStream() {
                @Override public void write(int value) throws IOException {
                    if (failWrite) throw new IOException("synthetic disk-full failure");
                    bytes.write(value);
                }
                @Override public void write(byte[] value, int offset, int length) throws IOException {
                    if (failWrite) throw new IOException("synthetic disk-full failure");
                    bytes.write(value, offset, length);
                }
                @Override public void flush() { }
                @Override public void close() { closed = true; }
            };
        }

        @Override public void commit(long copiedBytes) throws IOException {
            commits++;
            closedBeforeCommit = closed;
            if (failCommit) throw new IOException("synthetic commit failure");
            committedBytes = copiedBytes;
        }

        @Override public void abort() throws IOException {
            aborts++;
            if (failAbort) throw new IOException("synthetic abort failure");
            bytes.reset();
        }
    }
}
