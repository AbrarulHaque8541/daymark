package com.abrar.daymark;

import android.content.Context;
import android.util.AtomicFile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.Key;
import java.security.KeyStore;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

/**
 * Stores one active focus session in its own AES-GCM/AtomicFile blob.
 *
 * This file is deliberately separate from the encrypted task snapshot. A corrupt or unavailable focus-session
 * record cannot overwrite, migrate, or prevent access to the user's task snapshot.
 */
final class TaskFocusTimerStore {
    private static final String FILE_NAME = "focus-session.enc";
    private static final String KEY_ALIAS = "daymark.focus-timer.aes-gcm.v1";
    private static final int KEY_VERSION = 1;
    private static final Object FILE_ACCESS_LOCK = new Object();

    private final EncryptedBlobStore encryptedStore;

    TaskFocusTimerStore(Context context) {
        this(new File(context.getFilesDir(), FILE_NAME), new AndroidKeyAccess());
    }

    TaskFocusTimerStore(File file, EncryptedBlobStore.KeyAccess keyAccess) {
        AtomicFile atomicFile = new AtomicFile(file);
        encryptedStore = new EncryptedBlobStore(
                new AtomicFileAccess(atomicFile, file), keyAccess);
    }

    /** Returns null when no focus session is saved; corrupt/unreadable data throws safely. */
    TaskFocusTimer load(long nowElapsedRealtimeMs, long nowWallClockMs,
                        int currentBootCount) throws Exception {
        synchronized (FILE_ACCESS_LOCK) {
            EncryptedBlobStore.LoadResult result = encryptedStore.load();
            if (result.isEmpty()) return null;
            return TaskFocusTimerSnapshotCodec.restore(
                    result.plaintext(), nowElapsedRealtimeMs, nowWallClockMs, currentBootCount);
        }
    }

    /** Saves only the timer's task ID, mode, state and clock values in the independent encrypted file. */
    void save(TaskFocusTimer timer, long nowElapsedRealtimeMs,
              long nowWallClockMs, int bootCount) throws Exception {
        synchronized (FILE_ACCESS_LOCK) {
            // Verify the currently committed blob before replacing it. A corrupt or concurrently
            // changed focus file fails closed and never touches the encrypted task snapshot.
            encryptedStore.load();
            byte[] snapshot = TaskFocusTimerSnapshotCodec.encode(
                    timer, nowElapsedRealtimeMs, nowWallClockMs, bootCount);
            encryptedStore.save(snapshot);
        }
    }

    /** Writes an authenticated empty-session tombstone; it never deletes task data or keys. */
    void clear(long nowElapsedRealtimeMs, long nowWallClockMs, int bootCount) throws Exception {
        save(null, nowElapsedRealtimeMs, nowWallClockMs, bootCount);
    }

    private static final class AndroidKeyAccess implements EncryptedBlobStore.KeyAccess {
        @Override
        public SecretKey loadExistingKey() throws EncryptedBlobStore.StorageException {
            return existingKey();
        }

        @Override
        public SecretKey createKeyForNewStore() throws EncryptedBlobStore.StorageException {
            KeyStore keyStore = loadKeyStore();
            try {
                if (keyStore.containsAlias(KEY_ALIAS)) return existingKey(keyStore);
                KeyGenerator generator = KeyGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                        KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .setRandomizedEncryptionRequired(true)
                        .setUserAuthenticationRequired(false)
                        .build();
                generator.init(spec);
                return generator.generateKey();
            } catch (Exception exception) {
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE,
                        "The focus timer encryption key could not be created.", exception);
            }
        }

        @Override
        public SecretKey loadKeyForVersion(int keyVersion)
                throws EncryptedBlobStore.StorageException {
            if (keyVersion != KEY_VERSION) {
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE,
                        "The focus timer encryption key version is unsupported.");
            }
            return existingKey();
        }

        @Override
        public int newStoreKeyVersion() {
            return KEY_VERSION;
        }

        private static SecretKey existingKey() throws EncryptedBlobStore.StorageException {
            return existingKey(loadKeyStore());
        }

        private static SecretKey existingKey(KeyStore keyStore)
                throws EncryptedBlobStore.StorageException {
            try {
                if (!keyStore.containsAlias(KEY_ALIAS)) {
                    throw new EncryptedBlobStore.StorageException(
                            EncryptedBlobStore.Kind.KEY_UNAVAILABLE,
                            "The focus timer encryption key is missing.");
                }
                Key key = keyStore.getKey(KEY_ALIAS, null);
                if (key instanceof SecretKey) return (SecretKey) key;
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE,
                        "The focus timer encryption key is unusable.");
            } catch (EncryptedBlobStore.StorageException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE,
                        "The focus timer encryption key is unavailable.", exception);
            }
        }

        private static KeyStore loadKeyStore() throws EncryptedBlobStore.StorageException {
            try {
                KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
                keyStore.load(null);
                return keyStore;
            } catch (Exception exception) {
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE,
                        "Android Keystore is unavailable for the focus timer.", exception);
            }
        }
    }

    private static final class AtomicFileAccess implements EncryptedBlobStore.AtomicFileAccess {
        private final AtomicFile atomicFile;
        private final File baseFile;
        private final File backupFile;
        private final File stagedFile;

        AtomicFileAccess(AtomicFile atomicFile, File baseFile) {
            this.atomicFile = atomicFile;
            this.baseFile = baseFile;
            backupFile = new File(baseFile.getPath() + ".bak");
            stagedFile = new File(baseFile.getPath() + ".new");
        }

        @Override
        public boolean hasCommittedSnapshot() {
            return baseFile.exists() || backupFile.exists();
        }

        @Override
        public boolean hasAnyArtifacts() {
            return hasCommittedSnapshot() || stagedFile.exists();
        }

        @Override
        public InputStream openRead() throws IOException {
            return atomicFile.openRead();
        }

        @Override
        public OutputStream startWrite() throws IOException {
            return atomicFile.startWrite();
        }

        @Override
        public void finishWrite(OutputStream output) throws IOException {
            atomicFile.finishWrite((FileOutputStream) output);
        }

        @Override
        public void failWrite(OutputStream output) {
            atomicFile.failWrite((FileOutputStream) output);
        }
    }
}
