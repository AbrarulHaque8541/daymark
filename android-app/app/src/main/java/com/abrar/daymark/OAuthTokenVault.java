package com.abrar.daymark;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.Key;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/**
 * Separate no-backup OAuth token vault encrypted with the existing authenticated blob protocol
 * and a dedicated Android Keystore AES-GCM key. Must be used from a storage worker thread.
 */
final class OAuthTokenVault {
    private static final String KEY_ALIAS = "daymark.oauth-token-vault.aes-gcm.v1";
    private final EncryptedBlobStore encryptedStore;
    private List<OAuthCredential> credentials = Collections.emptyList();
    private boolean loadReady;

    OAuthTokenVault(Context context) {
        File root = context.getNoBackupFilesDir();
        File base = new File(root, "oauth-credentials.enc");
        AtomicFile atomic = new AtomicFile(base);
        encryptedStore = new EncryptedBlobStore(new AtomicAccess(atomic, base), new AndroidKeyAccess());
    }

    synchronized List<OAuthCredential> load() throws IOException {
        loadReady = false;
        credentials = Collections.emptyList();
        EncryptedBlobStore.LoadResult loaded = encryptedStore.load();
        List<OAuthCredential> decoded = loaded.isEmpty()
                ? Collections.emptyList() : OAuthCredentialCodec.decode(loaded.plaintext());
        credentials = Collections.unmodifiableList(new ArrayList<>(decoded));
        loadReady = true;
        return credentials;
    }

    synchronized OAuthCredential find(String providerId) throws IOException {
        requireLoaded();
        if (providerId == null) return null;
        for (OAuthCredential credential : credentials) {
            if (providerId.equals(credential.providerId)) return credential;
        }
        return null;
    }

    synchronized List<String> providerIds() throws IOException {
        requireLoaded();
        List<String> result = new ArrayList<>();
        for (OAuthCredential credential : credentials) result.add(credential.providerId);
        return Collections.unmodifiableList(result);
    }

    synchronized void put(OAuthCredential credential) throws IOException {
        requireLoaded();
        if (credential == null) throw new IOException("OAuth credential is required.");
        List<OAuthCredential> next = new ArrayList<>(credentials);
        boolean replaced = false;
        for (int index = 0; index < next.size(); index++) {
            if (credential.providerId != null && credential.providerId.equals(next.get(index).providerId)) {
                next.set(index, credential);
                replaced = true;
                break;
            }
        }
        if (!replaced) next.add(credential);
        byte[] encoded = OAuthCredentialCodec.encode(next);
        encryptedStore.save(encoded);
        credentials = Collections.unmodifiableList(next);
    }

    synchronized boolean remove(String providerId) throws IOException {
        requireLoaded();
        if (providerId == null) return false;
        List<OAuthCredential> next = new ArrayList<>();
        boolean removed = false;
        for (OAuthCredential credential : credentials) {
            if (providerId.equals(credential.providerId)) removed = true;
            else next.add(credential);
        }
        if (!removed) return false;
        encryptedStore.save(OAuthCredentialCodec.encode(next));
        credentials = Collections.unmodifiableList(next);
        return true;
    }

    synchronized void clear() throws IOException {
        requireLoaded();
        encryptedStore.save(OAuthCredentialCodec.encode(Collections.emptyList()));
        credentials = Collections.emptyList();
    }

    private void requireLoaded() throws IOException {
        if (!loadReady) throw new IOException("OAuth credential vault must load successfully before it can be changed.");
    }

    private static final class AndroidKeyAccess implements EncryptedBlobStore.KeyAccess {
        @Override
        public SecretKey loadExistingKey() throws EncryptedBlobStore.StorageException {
            try {
                KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
                keyStore.load(null);
                if (!keyStore.containsAlias(KEY_ALIAS)) {
                    throw new EncryptedBlobStore.StorageException(
                            EncryptedBlobStore.Kind.KEY_UNAVAILABLE, "The OAuth credential encryption key is missing.");
                }
                Key key = keyStore.getKey(KEY_ALIAS, null);
                if (key instanceof SecretKey) return (SecretKey) key;
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE, "The OAuth credential encryption key is unusable.");
            } catch (EncryptedBlobStore.StorageException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE, "Android Keystore is unavailable for OAuth credentials.", exception);
            }
        }

        @Override
        public SecretKey createKeyForNewStore() throws EncryptedBlobStore.StorageException {
            try {
                KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
                keyStore.load(null);
                if (keyStore.containsAlias(KEY_ALIAS)) return loadExistingKey();
                KeyGenerator generator = KeyGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                KeyGenParameterSpec specification = new KeyGenParameterSpec.Builder(
                        KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .setRandomizedEncryptionRequired(true)
                        .setUserAuthenticationRequired(false)
                        .build();
                generator.init(specification);
                return generator.generateKey();
            } catch (Exception exception) {
                throw new EncryptedBlobStore.StorageException(
                        EncryptedBlobStore.Kind.KEY_UNAVAILABLE, "OAuth credential encryption key could not be created.", exception);
            }
        }
    }

    private static final class AtomicAccess implements EncryptedBlobStore.AtomicFileAccess {
        private final AtomicFile atomic;
        private final File base;
        private final File backup;
        private final File staged;

        AtomicAccess(AtomicFile atomic, File base) {
            this.atomic = atomic;
            this.base = base;
            backup = new File(base.getPath() + ".bak");
            staged = new File(base.getPath() + ".new");
        }

        @Override public boolean hasCommittedSnapshot() {
            return base.exists() || backup.exists();
        }

        @Override public boolean hasAnyArtifacts() {
            return hasCommittedSnapshot() || staged.exists();
        }

        @Override public InputStream openRead() throws IOException {
            return atomic.openRead();
        }

        @Override public OutputStream startWrite() throws IOException {
            return atomic.startWrite();
        }

        @Override public void finishWrite(OutputStream output) throws IOException {
            if (!(output instanceof FileOutputStream)) throw new IOException("OAuth vault atomic writer is invalid.");
            atomic.finishWrite((FileOutputStream) output);
        }

        @Override public void failWrite(OutputStream output) {
            if (output instanceof FileOutputStream) atomic.failWrite((FileOutputStream) output);
        }
    }
}
