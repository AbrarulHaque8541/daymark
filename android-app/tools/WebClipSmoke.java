package com.abrar.daymark;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/** Host tests for clip boundaries and the actual task-snapshot/encrypted-blob path. */
public final class WebClipSmoke {
    private static int assertions;

    private WebClipSmoke() { }

    public static void main(String[] args) throws Exception {
        buildsReviewableDraftAndRemovesSensitiveUrlComponents();
        handlesSourcesConservatively();
        enforcesLengthsWithoutSplittingUnicode();
        editableDraftUsesNormalTaskValidation();
        encryptedSnapshotRoundTripAndWriteFailure();
        System.out.println("PASS offline web clip: " + assertions + " assertions");
    }

    private static void buildsReviewableDraftAndRemovesSensitiveUrlComponents() {
        WebClip.Draft draft = WebClip.fromReader(" A useful\narticle ",
                "  First paragraph.\n\nSecond paragraph.  ",
                "https://example.com/stories/one?token=secret#section");
        check(draft.title.equals("Read: A useful article"), "title becomes a one-line task title");
        check(draft.notes.equals("Source: https://example.com/stories/one\n\n"
                + "First paragraph.\n\nSecond paragraph."), "source and text are readable in the note");
        check(!draft.notes.contains("secret") && !draft.notes.contains("#section"),
                "query and fragment do not enter the draft");
        check(draft.sourceTreatment == WebClip.SourceTreatment.PARAMETERS_REMOVED,
                "redacted parameters are disclosed");
        check(!draft.excerptShortened, "a short extract is not marked shortened");
        check(NoteFormat.spans(draft.notes).stream().anyMatch(span -> span.kind == NoteFormat.Kind.LINK
                        && "https://example.com/stories/one".equals(span.target)),
                "HTTPS source remains a tappable task-note link");
        WebClip.Draft plain = WebClip.fromReader("Title", "Article", "http://example.com/path");
        check(plain.notes.startsWith("Source: http://example.com/path\n\n"),
                "HTTP sources are preserved as plain text, not upgraded");
        check(NoteFormat.spans(plain.notes).isEmpty(), "HTTP source is not offered as an HTTPS link");
        check(plain.sourceTreatment == WebClip.SourceTreatment.UNCHANGED, "unmodified source is identified");
    }

    private static void handlesSourcesConservatively() {
        String[] rejected = {null, "", "javascript:alert(1)", "file:///secret", "https://alice:password@example.com/x",
                "https://alice@password@example.com/x", "https://example.com:0/x"};
        for (String url : rejected) {
            WebClip.Draft draft = WebClip.fromReader("Title", "body", url);
            check(draft.sourceTreatment == WebClip.SourceTreatment.OMITTED, "unsafe source is omitted");
            check(draft.notes.equals("body"), "an unsafe source never enters the note");
        }
        WebClip.Draft longPath = WebClip.fromReader("Title", "body",
                "https://example.com/" + repeat('x', WebClip.MAX_SOURCE_CHARS + 1) + "?token=secret");
        check(longPath.sourceTreatment == WebClip.SourceTreatment.ORIGIN_ONLY,
                "long URL falls back to its origin");
        check(longPath.notes.equals("Source: https://example.com\n\nbody"),
                "origin fallback leaves room for the excerpt");
        WebClip.Draft encoded = WebClip.fromReader("Title", "body", "https://example.com/a%20b?x=1");
        check(encoded.notes.startsWith("Source: https://example.com/a%20b\n\n"),
                "encoded path is not double encoded");
        expectFailure(() -> WebClip.fromReader("Title", null, "https://example.com"), "null text");
        expectFailure(() -> WebClip.fromReader("Title", "  \n  ", "https://example.com"), "blank text");
    }

    private static void enforcesLengthsWithoutSplittingUnicode() {
        String sourcePrefix = "Source: https://example.com/story\n\n";
        int available = TaskLogic.MAX_NOTES_CHARS - sourcePrefix.length();
        WebClip.Draft exact = WebClip.fromReader("Exact", repeat('a', available), "https://example.com/story");
        check(exact.notes.length() == TaskLogic.MAX_NOTES_CHARS, "exact note boundary fits");
        check(!exact.excerptShortened, "exact note boundary is not reported truncated");
        WebClip.Draft over = WebClip.fromReader("Over", repeat('a', available + 1), "https://example.com/story");
        check(over.notes.length() == TaskLogic.MAX_NOTES_CHARS && over.excerptShortened,
                "the first over-limit character is disclosed");
        WebClip.Draft emoji = WebClip.fromReader("Emoji", repeat('a', available - 1) + "\uD83D\uDE80" + "more",
                "https://example.com/story");
        check(emoji.excerptShortened && emoji.notes.length() == TaskLogic.MAX_NOTES_CHARS - 1,
                "excerpt does not split a surrogate pair at the note limit");
        check(!Character.isHighSurrogate(emoji.notes.charAt(emoji.notes.length() - 1)),
                "excerpt never ends in a dangling high surrogate");
        WebClip.Draft title = WebClip.fromReader(repeat('t', 153) + "\uD83D\uDE80tail", "body", null);
        check(title.title.length() <= WebClip.MAX_TITLE_CHARS, "title is bounded");
        check(!Character.isHighSurrogate(title.title.charAt(title.title.length() - 1)),
                "title truncation preserves surrogate pairs");
        WebClip.Draft invalidUnicode = WebClip.fromReader("bad\uD800title", "one\uDC00two", null);
        check(invalidUnicode.title.contains("\uFFFD") && invalidUnicode.notes.contains("\uFFFD"),
                "unpaired surrogates from page data are safely replaced");
        WebClip.Draft huge = WebClip.fromReader("Title", repeat('b', WebClip.MAX_READER_CHARS + 50), null);
        check(huge.excerptShortened && huge.notes.length() == TaskLogic.MAX_NOTES_CHARS,
                "an unbounded caller remains bounded and reports shortening");
        check(WebClip.taskTitle("\n\t").equals("Read this article"), "blank title has a useful fallback");
    }

    private static void editableDraftUsesNormalTaskValidation() throws Exception {
        WebClip.Draft original = WebClip.fromReader("Article", "Body", "https://example.com/page");
        WebClip.Draft edited = original.withTitle("Custom task").withNotes("My selected note");
        check(original.title.equals("Read: Article") && original.notes.contains("Body"),
                "editing does not mutate the original retained draft");
        Task task = WebClip.createTask(edited);
        check(TaskLogic.isValid(task), "clip creates a valid ordinary task");
        check(task.title.equals("Custom task") && task.notes.equals("My selected note"),
                "reviewed values are the saved values");
        check(task.tags.equals(Collections.singletonList("web-clip")), "clip has a discoverable local tag");
        check(!task.completed && task.dueDate == null && task.priority.equals("medium"),
                "clip uses ordinary, non-reminding defaults");
        check(TaskLogic.filter(Collections.singletonList(task), TaskLogic.FILTER_ALL,
                "selected", "web-clip", LocalDate.now()).size() == 1,
                "saved clip can be found offline by note and tag");
        expectFailure(() -> WebClip.createTask(edited.withTitle("  ")), "empty edited title");
        expectFailure(() -> WebClip.createTask(edited.withNotes(repeat('n', TaskLogic.MAX_NOTES_CHARS + 1))),
                "oversized edited note");
        Task unicode = WebClip.createTask(edited.withTitle("Name\uD800").withNotes("Note\uDC00"));
        byte[] snapshot = TaskSnapshotCodec.encode(Collections.singletonList(unicode), Collections.emptyList());
        TaskSnapshotCodec.Snapshot roundTrip = TaskSnapshotCodec.decode(snapshot);
        check(roundTrip.tasks.get(0).title.equals("Name\uFFFD")
                        && roundTrip.tasks.get(0).notes.equals("Note\uFFFD"),
                "even malformed edited UTF-16 round-trips through the strict snapshot decoder");
    }

    private static void encryptedSnapshotRoundTripAndWriteFailure() throws Exception {
        MemoryFile file = new MemoryFile();
        FixedKeys keys = new FixedKeys();
        EncryptedBlobStore store = new EncryptedBlobStore(file, keys);
        check(store.load().isEmpty(), "new encrypted store opens empty");
        Task existing = TaskLogic.create("Existing task", null, "medium");
        byte[] before = TaskSnapshotCodec.encode(Collections.singletonList(existing), Collections.emptyList());
        store.save(before);
        byte[] committedBefore = file.bytes.clone();

        WebClip.Draft draft = WebClip.fromReader("Private article", "SENSITIVE-CLIP-TEXT",
                "https://example.com/private?token=secret");
        Task clip = WebClip.createTask(draft);
        List<Task> combined = Arrays.asList(existing, clip);
        byte[] snapshot = TaskSnapshotCodec.encode(combined, Collections.emptyList());
        file.failNextWrite = true;
        try {
            store.save(snapshot);
            throw new AssertionError("write failure was not reported");
        } catch (EncryptedBlobStore.StorageException expected) {
            check(expected.kind() == EncryptedBlobStore.Kind.WRITE_FAILED, "write failure is surfaced");
        }
        check(Arrays.equals(committedBefore, file.bytes), "failed clip save leaves previous encrypted data intact");
        EncryptedBlobStore retry = new EncryptedBlobStore(file, keys);
        TaskSnapshotCodec.Snapshot old = TaskSnapshotCodec.decode(retry.load().plaintext());
        check(old.tasks.size() == 1 && old.tasks.get(0).id.equals(existing.id),
                "previous task still opens after a failed save");
        retry.save(snapshot);
        check(!new String(file.bytes, StandardCharsets.ISO_8859_1).contains("SENSITIVE-CLIP-TEXT"),
                "committed blob does not contain the clip as plaintext");
        EncryptedBlobStore reopened = new EncryptedBlobStore(file, keys);
        TaskSnapshotCodec.Snapshot restored = TaskSnapshotCodec.decode(reopened.load().plaintext());
        check(restored.tasks.size() == 2 && restored.tasks.get(1).notes.equals(clip.notes)
                        && restored.tasks.get(1).tags.contains(WebClip.TAG),
                "encrypted snapshot reopens with the clip and existing task intact");
        file.bytes[file.bytes.length - 1] ^= 1;
        byte[] tampered = file.bytes.clone();
        try {
            new EncryptedBlobStore(file, keys).load();
            throw new AssertionError("tampered ciphertext was accepted");
        } catch (EncryptedBlobStore.StorageException expected) {
            check(expected.kind() == EncryptedBlobStore.Kind.AUTHENTICATION_FAILED,
                    "tampering is reported rather than treated as an empty list");
        }
        check(Arrays.equals(file.bytes, tampered), "failed authentication does not clear the blob");
    }

    private static String repeat(char value, int count) {
        char[] chars = new char[count];
        Arrays.fill(chars, value);
        return new String(chars);
    }

    private static void expectFailure(Runnable action, String message) {
        try {
            action.run();
            throw new AssertionError("Expected failure for " + message);
        } catch (IllegalArgumentException expected) {
            check(true, message + " is rejected");
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static final class FixedKeys implements EncryptedBlobStore.KeyAccess {
        private final SecretKey key = new SecretKeySpec(new byte[32], "AES");
        @Override public SecretKey loadExistingKey() { return key; }
        @Override public SecretKey createKeyForNewStore() { return key; }
    }

    private static final class MemoryFile implements EncryptedBlobStore.AtomicFileAccess {
        byte[] bytes;
        boolean failNextWrite;
        @Override public boolean hasCommittedSnapshot() { return bytes != null; }
        @Override public boolean hasAnyArtifacts() { return bytes != null; }
        @Override public InputStream openRead() throws IOException {
            if (bytes == null) throw new IOException("No committed snapshot");
            return new ByteArrayInputStream(bytes);
        }
        @Override public OutputStream startWrite() { return new ByteArrayOutputStream(); }
        @Override public void finishWrite(OutputStream output) throws IOException {
            if (failNextWrite) {
                failNextWrite = false;
                throw new IOException("Simulated write failure");
            }
            bytes = ((ByteArrayOutputStream) output).toByteArray();
        }
        @Override public void failWrite(OutputStream output) { ((ByteArrayOutputStream) output).reset(); }
    }
}
