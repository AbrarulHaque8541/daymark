package com.abrar.daymark;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Local-only extension registry (built-ins + user packs in app private storage). */
final class ExtensionStore {
    private static final String PREFS = "daymark.extensions.v1";
    private static final String KEY_DISABLED_BUILTINS = "disabled_builtin_ids";
    private static final String KEY_EXTENSIONS_ENABLED = "extensions_enabled";
    private static final String KEY_DISABLED_SITES_PREFIX = "disabled_sites.";
    private static final String USER_DIR = "browser_extensions";
    private static final int MAX_USER_PACK_BYTES = 200_000;

    private final SharedPreferences preferences;
    private final File userDir;

    ExtensionStore(Context context) {
        Context app = context.getApplicationContext();
        this.preferences = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.userDir = new File(app.getFilesDir(), USER_DIR);
        if (!userDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            userDir.mkdirs();
        }
    }

    /** Global kill switch: when off, no pack is injected into any page. */
    boolean isGloballyEnabled() {
        return preferences.getBoolean(KEY_EXTENSIONS_ENABLED, true);
    }

    void setGloballyEnabled(boolean enabled) {
        preferences.edit().putBoolean(KEY_EXTENSIONS_ENABLED, enabled).apply();
    }

    /** Hosts where a built-in pack is paused (per-site disable, persisted per pack id). */
    List<String> disabledSitesForBuiltin(String id) {
        String csv = preferences.getString(KEY_DISABLED_SITES_PREFIX + id, "");
        List<String> sites = new ArrayList<>();
        if (csv != null && !csv.isEmpty()) {
            for (String part : csv.split(",")) {
                if (!part.isEmpty() && !sites.contains(part)) sites.add(part);
            }
        }
        return sites;
    }

    void setSiteDisabled(String id, String host, boolean disabled) {
        if (id == null || id.trim().isEmpty() || host == null || host.trim().isEmpty()) return;
        String normalizedHost = BrowserExtension.normalizeSiteHost(host);
        if (normalizedHost == null) return;
        if (id.startsWith("daymark.builtin.")) {
            List<String> sites = new ArrayList<>(disabledSitesForBuiltin(id));
            if (disabled) {
                if (!sites.contains(normalizedHost)) sites.add(normalizedHost);
            } else {
                sites.remove(normalizedHost);
            }
            preferences.edit().putString(KEY_DISABLED_SITES_PREFIX + id, join(sites)).apply();
            return;
        }
        File file = findUserPack(id);
        if (file == null) return;
        try {
            BrowserExtension ext = ExtensionPackageParser.parseDaymarkJson(readFile(file), false);
            List<String> sites = new ArrayList<>(ext.disabledSites);
            if (disabled) {
                if (!sites.contains(normalizedHost)) sites.add(normalizedHost);
            } else {
                sites.remove(normalizedHost);
            }
            writeFile(file, ExtensionPackageParser.toDaymarkJson(ext.withDisabledSites(sites)));
        } catch (Exception ignored) {
            // Corrupt packs remain hidden from the runtime until re-imported.
        }
    }

    /** Serialized pack text for user-pack export, or null when the pack is missing. */
    String userPackJson(String id) {
        if (id == null || id.startsWith("daymark.builtin.")) return null;
        File file = findUserPack(id);
        if (file == null) return null;
        try {
            return readFile(file);
        } catch (Exception exception) {
            return null;
        }
    }

    List<BrowserExtension> listAll() {
        Map<String, BrowserExtension> byId = new LinkedHashMap<>();
        for (BrowserExtension builtIn : BuiltInExtensions.all()) {
            boolean enabled = !isBuiltinDisabled(builtIn.id);
            byId.put(builtIn.id, builtIn.withEnabled(enabled)
                    .withDisabledSites(disabledSitesForBuiltin(builtIn.id)));
        }
        File[] files = userDir.listFiles((dir, name) -> name != null && name.endsWith(".daymark-ext.json"));
        if (files != null) {
            for (File file : files) {
                try {
                    String raw = readFile(file);
                    BrowserExtension ext = ExtensionPackageParser.parseDaymarkJson(raw, false);
                    byId.put(ext.id, ext);
                } catch (Exception ignored) {
                    // skip corrupt pack
                }
            }
        }
        return new ArrayList<>(byId.values());
    }

    List<BrowserExtension> enabledMatching(String pageUrl) {
        List<BrowserExtension> out = new ArrayList<>();
        for (BrowserExtension ext : listAll()) {
            if (ext.enabled && ext.matchesUrl(pageUrl)) out.add(ext);
        }
        return out;
    }

    void setBuiltinEnabled(String id, boolean enabled) {
        if (id == null || !id.startsWith("daymark.builtin.")) return;
        String csv = preferences.getString(KEY_DISABLED_BUILTINS, "");
        List<String> disabled = new ArrayList<>();
        if (csv != null && !csv.isEmpty()) {
            for (String part : csv.split(",")) {
                if (!part.isEmpty() && !part.equals(id)) disabled.add(part);
            }
        }
        if (!enabled) disabled.add(id);
        preferences.edit().putString(KEY_DISABLED_BUILTINS, join(disabled)).apply();
    }

    void installUserPack(BrowserExtension ext) throws Exception {
        if (ext == null || ext.builtIn) throw new IllegalArgumentException("Invalid pack.");
        if (ext.id.startsWith("daymark.builtin.")) {
            throw new IllegalArgumentException("Cannot overwrite built-in id.");
        }
        File out = new File(userDir, sanitizeFileName(ext.id) + ".daymark-ext.json");
        BrowserExtension existing = null;
        if (out.exists()) {
            // Read failures are not parse failures: never replace a file that could not be
            // inspected (including an oversized file or a non-regular path).
            String existingJson;
            try {
                existingJson = readFile(out);
            } catch (IOException unreadable) {
                throw new IOException("Existing extension pack could not be read; refusing to replace it.", unreadable);
            }
            try {
                existing = ExtensionPackageParser.parseDaymarkJson(existingJson, false);
            } catch (Exception malformed) {
                // Malformed bytes are still user data. Never replace them as a side effect
                // of importing another pack with the same id; require explicit recovery/removal.
                throw new IOException("Existing extension pack is malformed; refusing to replace it.", malformed);
            }
        }
        if (existing != null && !isSamePack(existing, ext)) {
            throw new IllegalArgumentException("A different extension pack is already installed with id "
                    + ext.id + ". Uninstall it before importing a different pack.");
        }
        if (existing == null) {
            // Treat a new import as untrusted until the user enables it in the manager.
            ext = ExtensionPackageParser.prepareNewUserPackInstall(ext);
        } else {
            // Re-importing identical content must not silently re-enable a pack or clear
            // the user's per-site pause list.
            ext = ext.withEnabled(existing.enabled).withDisabledSites(existing.disabledSites);
        }
        writeFile(out, ExtensionPackageParser.toDaymarkJson(ext));
    }

    /** Content comparison used by the install conflict guard; storage-derived metadata is ignored. */
    private static boolean isSamePack(BrowserExtension a, BrowserExtension b) {
        return a.id.equals(b.id)
                && a.name.equals(b.name)
                && a.version.equals(b.version)
                && a.matches.equals(b.matches)
                && a.excludes.equals(b.excludes)
                && a.css.equals(b.css)
                && a.js.equals(b.js);
    }

    void setUserPackEnabled(String id, boolean enabled) {
        if (id == null || id.trim().isEmpty() || id.startsWith("daymark.builtin.")) return;
        File file = findUserPack(id);
        if (file == null) return;
        try {
            BrowserExtension ext = ExtensionPackageParser.parseDaymarkJson(readFile(file), false);
            BrowserExtension updated = ext.withEnabled(enabled);
            writeFile(file, ExtensionPackageParser.toDaymarkJson(updated));
        } catch (Exception ignored) {
            // Corrupt packs remain hidden from the runtime until re-imported.
        }
    }

    /**
     * A non-executable recovery record for a user pack that cannot be parsed safely.
     * The descriptor contains metadata and a content fingerprint, never the raw pack bytes.
     */
    static final class MalformedUserPack {
        static final String STATE_MALFORMED = "malformed";
        static final String STATE_OVERSIZED = "oversized";
        static final String STATE_UNREADABLE = "unreadable";
        static final String STATE_NON_REGULAR = "non_regular";

        final String fileName;
        final String displayId;
        final long byteSize;
        final String state;
        final String reason;
        final String sha256;
        final boolean canExport;
        final boolean canRemove;

        MalformedUserPack(String fileName, long byteSize, String state, String reason,
                          String sha256, boolean canExport, boolean canRemove) {
            this.fileName = fileName;
            this.displayId = fileName.substring(0, fileName.length() - ".daymark-ext.json".length());
            this.byteSize = byteSize;
            this.state = state;
            this.reason = reason;
            this.sha256 = sha256;
            this.canExport = canExport;
            this.canRemove = canRemove;
        }
    }

    /**
     * Enumerates malformed or unsafe user-pack files without loading or executing them.
     * Valid packs are omitted. Unsafe files remain visible as disabled recovery metadata.
     */
    List<MalformedUserPack> listMalformedUserPacks() throws IOException {
        synchronized (ExtensionStore.class) {
            Path directory = userDir.toPath();
            if (!Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) return new ArrayList<>();
            if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("Extension pack directory is not a regular directory.");
            }
            List<MalformedUserPack> result = new ArrayList<>();
            try (DirectoryStream<Path> files = Files.newDirectoryStream(directory)) {
                for (Path path : files) {
                    String name = path.getFileName().toString();
                    if (!isSafeUserPackFileName(name)) continue;
                    MalformedUserPack record = inspectMalformedUserPack(path, name);
                    if (record != null) result.add(record);
                }
            }
            result.sort(Comparator.comparing(record -> record.fileName));
            return result;
        }
    }

    /**
     * Reads the exact original bytes of a malformed pack after verifying the listing fingerprint.
     * Oversized, unreadable, non-regular, changed, or now-valid files fail closed.
     */
    byte[] readMalformedUserPackBytes(String fileName, String expectedSha256) throws IOException {
        synchronized (ExtensionStore.class) {
            Path path = resolveSafeUserPackPath(fileName);
            byte[] bytes = readStableBytes(path);
            verifyMalformedFingerprint(bytes, expectedSha256);
            return bytes.clone();
        }
    }

    /**
     * Removes only the selected malformed regular file after its exact fingerprint is rechecked.
     * The caller must obtain explicit user confirmation before invoking this method.
     */
    void removeMalformedUserPack(String fileName, String expectedSha256) throws IOException {
        synchronized (ExtensionStore.class) {
            Path path = resolveSafeUserPackPath(fileName);
            byte[] first = readStableBytes(path);
            verifyMalformedFingerprint(first, expectedSha256);
            byte[] second = readStableBytes(path);
            if (!Arrays.equals(first, second)) {
                throw new IOException("Extension pack changed during removal; refusing to delete it.");
            }
            Files.delete(path);
        }
    }

    private MalformedUserPack inspectMalformedUserPack(Path path, String fileName) {
        try {
            BasicFileAttributes attributes = Files.readAttributes(
                    path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (!attributes.isRegularFile()) {
                return new MalformedUserPack(fileName, attributes.size(),
                        MalformedUserPack.STATE_NON_REGULAR,
                        "Not a regular file; export and removal are disabled.",
                        null, false, false);
            }
            if (attributes.size() > MAX_USER_PACK_BYTES) {
                return new MalformedUserPack(fileName, attributes.size(),
                        MalformedUserPack.STATE_OVERSIZED,
                        "File exceeds the safe recovery read limit.",
                        null, false, false);
            }
            byte[] bytes = readStableBytes(path);
            if (!isMalformedPackBytes(bytes)) return null;
            return new MalformedUserPack(fileName, bytes.length,
                    MalformedUserPack.STATE_MALFORMED,
                    "Stored extension data is malformed or has an unsupported encoding.",
                    sha256Hex(bytes), true, true);
        } catch (IOException failure) {
            if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return null;
            return new MalformedUserPack(fileName, -1L,
                    MalformedUserPack.STATE_UNREADABLE,
                    "File could not be read safely; export and removal are disabled.",
                    null, false, false);
        }
    }

    private static boolean isSafeUserPackFileName(String fileName) {
        return fileName != null
                && fileName.matches("[A-Za-z0-9._-]{1,80}\\.daymark-ext\\.json");
    }

    private Path resolveSafeUserPackPath(String fileName) throws IOException {
        if (!isSafeUserPackFileName(fileName)) {
            throw new IOException("Invalid extension recovery filename.");
        }
        Path directory = userDir.toPath().toAbsolutePath().normalize();
        Path path = directory.resolve(fileName).normalize();
        if (!directory.equals(path.getParent())) {
            throw new IOException("Extension recovery path escapes the private pack directory.");
        }
        return path;
    }

    private static byte[] readStableBytes(Path path) throws IOException {
        byte[] first = readBoundedBytes(path);
        byte[] second = readBoundedBytes(path);
        if (!Arrays.equals(first, second)) {
            throw new IOException("Extension pack changed while being inspected.");
        }
        return second;
    }

    private static byte[] readBoundedBytes(Path path) throws IOException {
        BasicFileAttributes before = Files.readAttributes(
                path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!before.isRegularFile()) {
            throw new IOException("Extension recovery target is not a regular file.");
        }
        long expectedLength = before.size();
        if (expectedLength > MAX_USER_PACK_BYTES) {
            throw new IOException("Extension recovery file exceeds the safe byte limit.");
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream((int) expectedLength);
        try (InputStream in = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) {
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = in.read(buffer)) != -1) {
                if (read > MAX_USER_PACK_BYTES - total) {
                    throw new IOException("Extension recovery file exceeded the safe byte limit.");
                }
                out.write(buffer, 0, read);
                total += read;
            }
            if (total != expectedLength) {
                throw new IOException("Extension recovery file changed while being read.");
            }
        }
        BasicFileAttributes after = Files.readAttributes(
                path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!after.isRegularFile()
                || after.size() != expectedLength
                || !before.lastModifiedTime().equals(after.lastModifiedTime())
                || (before.fileKey() != null && !before.fileKey().equals(after.fileKey()))) {
            throw new IOException("Extension recovery file changed while being read.");
        }
        return out.toByteArray();
    }

    private static boolean isMalformedPackBytes(byte[] bytes) {
        try {
            String text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
            ExtensionPackageParser.parseDaymarkJson(text, false);
            return false;
        } catch (Exception malformed) {
            return true;
        }
    }

    private static String sha256Hex(byte[] bytes) throws IOException {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest) result.append(String.format("%02x", value & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IOException("SHA-256 is unavailable for extension recovery.", impossible);
        }
    }

    private static void verifyMalformedFingerprint(byte[] bytes, String expectedSha256) throws IOException {
        if (expectedSha256 == null || !expectedSha256.matches("[a-f0-9]{64}")) {
            throw new IOException("A valid recovery fingerprint is required.");
        }
        if (!expectedSha256.equals(sha256Hex(bytes))) {
            throw new IOException("Extension pack changed since it was listed; refusing the operation.");
        }
        if (!isMalformedPackBytes(bytes)) {
            throw new IOException("Extension pack is no longer malformed; refusing recovery deletion/export.");
        }
    }

    private File findUserPack(String id) {
        if (id == null) return null;
        File file = new File(userDir, sanitizeFileName(id) + ".daymark-ext.json");
        return file.exists() ? file : null;
    }

    void uninstallUserPack(String id) {
        synchronized (ExtensionStore.class) {
            if (id == null || id.startsWith("daymark.builtin.")) return;
            File out = new File(userDir, sanitizeFileName(id) + ".daymark-ext.json");
            //noinspection ResultOfMethodCallIgnored
            out.delete();
        }
    }

    private boolean isBuiltinDisabled(String id) {
        String csv = preferences.getString(KEY_DISABLED_BUILTINS, "");
        if (csv == null || csv.isEmpty()) return false;
        for (String part : csv.split(",")) {
            if (id.equals(part)) return true;
        }
        return false;
    }

    private static String join(List<String> parts) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(parts.get(i));
        }
        return sb.toString();
    }

    private static String sanitizeFileName(String id) {
        return id.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private static String readFile(File file) throws IOException {
        if (file == null || !file.isFile()) {
            throw new IOException("Extension pack path is not a regular file.");
        }
        long initialLength = file.length();
        if (initialLength > MAX_USER_PACK_BYTES) {
            throw new IOException("Extension pack exceeds the " + MAX_USER_PACK_BYTES + " byte read limit.");
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream((int) initialLength);
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = in.read(buffer)) != -1) {
                if (read > MAX_USER_PACK_BYTES - total) {
                    throw new IOException("Extension pack exceeded the byte limit while being read.");
                }
                out.write(buffer, 0, read);
                total += read;
            }
            if (total != initialLength) {
                throw new IOException("Extension pack changed while being read.");
            }
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static synchronized void writeFile(File file, String content) throws Exception {
        File tmp = new File(file.getAbsolutePath() + ".tmp");
        try {
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            // Same-directory replacement. A failed move leaves the previous pack untouched.
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } finally {
            if (tmp.exists()) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
        }
    }
}
