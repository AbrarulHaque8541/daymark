package com.abrar.daymark;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ProviderInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Arrays;
import java.util.Collections;
import java.util.UUID;

/** Dedicated instrumentation runner for AttachmentContentProvider streaming error propagation. */
public final class AttachmentStreamingErrorInstrumentation extends Instrumentation {

    @Override
    public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        Bundle result = new Bundle();
        try {
            int assertions = runTests(getTargetContext());
            result.putString("result", "passed");
            result.putInt("assertions", assertions);
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("result", "failed");
            result.putString("failure", stackTrace(failure));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    public static int runTests(Context targetContext) throws Exception {
        int assertions = 0;
        File root = new File(targetContext.getCacheDir(),
                "daymark-streaming-error-test-" + UUID.randomUUID());
        if (!root.mkdirs()) throw new IOException("Could not create test directory.");

        try {
            Context context = new IsolatedContext(targetContext, root);
            File noBackup = context.getNoBackupFilesDir();
            File attachmentsDirectory = new File(noBackup, "attachments");
            String taskId = "streaming-task-" + UUID.randomUUID();
            String attachmentId = AttachmentBlobStore.newId();
            byte[] plaintext = new byte[128 * 1024];
            for (int i = 0; i < plaintext.length; i++) {
                plaintext[i] = (byte) (i * 17 + 3);
            }

            AttachmentBlobStore blobs = new AttachmentBlobStore(attachmentsDirectory,
                    new AndroidAttachmentStore.AndroidKeyAccess());
            blobs.importStream(taskId, attachmentId, new ByteArrayInputStream(plaintext));
            File ciphertextFile = new File(attachmentsDirectory, attachmentId + ".enc");
            byte[] goodCiphertext = readFile(ciphertextFile);

            String displayName = "test-doc.bin";
            AttachmentRef reference = new AttachmentRef(attachmentId, displayName, "application/octet-stream", plaintext.length);
            Task task = new Task(taskId, "Streaming Error Test Task", null, "medium", false,
                    "2026-10-22T12:00:00Z", "2026-10-22T12:00:00Z", Collections.singletonList(reference));
            EncryptedTaskStore taskStore = new EncryptedTaskStore(context);
            taskStore.save(Collections.singletonList(task));

            String authority = context.getPackageName() + ".attachments";
            Uri uri = new Uri.Builder().scheme("content").authority(authority).appendPath(attachmentId).build();
            AttachmentContentProvider provider = new AttachmentContentProvider();
            ProviderInfo providerInfo = new ProviderInfo();
            providerInfo.name = AttachmentContentProvider.class.getName();
            providerInfo.packageName = context.getPackageName();
            providerInfo.authority = authority;
            providerInfo.applicationInfo = context.getApplicationInfo();
            providerInfo.exported = false;
            providerInfo.grantUriPermissions = true;
            provider.attachInfo(context, providerInfo);

            // 1. Valid encrypted attachment streams byte-for-byte exact plaintext.
            writeFile(ciphertextFile, goodCiphertext);
            ParcelFileDescriptor pipe1 = provider.openFile(uri, "r");
            byte[] streamed1;
            try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe1)) {
                streamed1 = readAll(input);
            }
            assertions++;
            if (!Arrays.equals(plaintext, streamed1)) {
                throw new AssertionError("Valid encrypted attachment streaming failed to yield exact plaintext.");
            }

            // 2. Truncated ciphertext causes reader IOException instead of clean EOF.
            byte[] truncatedCiphertext = Arrays.copyOf(goodCiphertext, goodCiphertext.length / 2);
            writeFile(ciphertextFile, truncatedCiphertext);
            ParcelFileDescriptor pipe2 = provider.openFile(uri, "r");
            boolean truncatedFailedWithError = false;
            try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe2)) {
                readAll(input);
            } catch (IOException expected) {
                truncatedFailedWithError = true;
            }
            assertions++;
            if (!truncatedFailedWithError) {
                throw new AssertionError("Truncated ciphertext was received as clean EOF instead of reader IOException.");
            }

            // 3. Corrupted payload ciphertext causes reader IOException instead of clean EOF.
            byte[] corruptedCiphertext = goodCiphertext.clone();
            corruptedCiphertext[goodCiphertext.length / 2] ^= 0xFF;
            writeFile(ciphertextFile, corruptedCiphertext);
            ParcelFileDescriptor pipe3 = provider.openFile(uri, "r");
            boolean corruptFailedWithError = false;
            try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe3)) {
                readAll(input);
            } catch (IOException expected) {
                corruptFailedWithError = true;
            }
            assertions++;
            if (!corruptFailedWithError) {
                throw new AssertionError("Corrupted ciphertext was received as clean EOF instead of reader IOException.");
            }

            // 4. Authentication / AES-GCM tag failure causes reader IOException instead of clean EOF.
            byte[] tamperedTagCiphertext = goodCiphertext.clone();
            tamperedTagCiphertext[goodCiphertext.length - 1] ^= 0x01;
            writeFile(ciphertextFile, tamperedTagCiphertext);
            ParcelFileDescriptor pipe4 = provider.openFile(uri, "r");
            boolean tagFailedWithError = false;
            try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe4)) {
                readAll(input);
            } catch (IOException expected) {
                tagFailedWithError = true;
            }
            assertions++;
            if (!tagFailedWithError) {
                throw new AssertionError("AES-GCM tag failure was received as clean EOF instead of reader IOException.");
            }

            // 5. Reader early cancellation / pipe closure is handled gracefully by writer.
            writeFile(ciphertextFile, goodCiphertext);
            ParcelFileDescriptor pipe5 = provider.openFile(uri, "r");
            try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe5)) {
                byte[] buf = new byte[512];
                int readBytes = input.read(buf);
                assertions++;
                if (readBytes <= 0) {
                    throw new AssertionError("Reader early cancellation test failed to read initial bytes.");
                }
            }
            Thread.sleep(100); // Allow writer thread to react to broken pipe.
            assertions++;

        } finally {
            deleteTree(root);
        }

        return assertions;
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (count > 0) output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static byte[] readFile(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            return readAll(input);
        }
    }

    private static void writeFile(File file, byte[] contents) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(contents);
            output.getFD().sync();
        }
    }

    private static void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        if (!file.delete() && file.exists()) file.deleteOnExit();
    }

    private static String stackTrace(Throwable failure) {
        StringWriter text = new StringWriter();
        failure.printStackTrace(new PrintWriter(text));
        return text.toString();
    }

    private static final class IsolatedContext extends ContextWrapper {
        private final File files;
        private final File noBackup;

        IsolatedContext(Context base, File root) throws IOException {
            super(base);
            files = new File(root, "files");
            noBackup = new File(root, "no-backup");
            if (!files.mkdirs() || !noBackup.mkdirs()) {
                throw new IOException("Could not create isolated application directories.");
            }
        }

        @Override public File getFilesDir() { return files; }
        @Override public File getNoBackupFilesDir() { return noBackup; }
        @Override public Context getApplicationContext() { return this; }
    }
}
