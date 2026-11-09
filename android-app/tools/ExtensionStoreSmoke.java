package com.abrar.daymark;

import android.content.Context;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;

/** Real filesystem/persistence checks for ExtensionStore using isolated host-only Android stubs. */
public final class ExtensionStoreSmoke {
    private static int assertions;

    public static void main(String[] args) throws Exception {
        File root = new File(System.getProperty("java.io.tmpdir"),
                "daymark-extension-store-smoke-" + System.nanoTime());
        if (!root.mkdirs()) throw new AssertionError("could not create owned temporary test directory");
        try {
            ExtensionStore store = new ExtensionStore(new Context(root));
            String id = "user.store-smoke";
            BrowserExtension incoming = ExtensionPackageParser.parseDaymarkJson(pack(id, "window.sample = 1;", true), false);
            store.installUserPack(incoming);

            BrowserExtension firstInstall = stored(store, id);
            check(!firstInstall.enabled, "a new imported pack is persisted disabled");
            check(firstInstall.warnings.contains("not an isolated extension sandbox"),
                    "the persisted new pack retains its page-context trust disclosure");

            store.setUserPackEnabled(id, true);
            store.setSiteDisabled(id, "example.com", true);
            BrowserExtension reimport = ExtensionPackageParser.parseDaymarkJson(pack(id, "window.sample = 1;", false), false);
            store.installUserPack(reimport);
            BrowserExtension samePack = stored(store, id);
            check(samePack.enabled, "identical re-import preserves the existing enabled state");
            check(samePack.disabledSites.contains("example.com"),
                    "identical re-import preserves the user's per-site pause state");

            BrowserExtension conflict = ExtensionPackageParser.parseDaymarkJson(pack(id, "window.sample = 2;", true), false);
            expectConflict(store, conflict);
            BrowserExtension afterConflict = stored(store, id);
            check("window.sample = 1;".equals(afterConflict.js),
                    "a conflicting import does not overwrite the installed script");
            check(afterConflict.enabled && afterConflict.disabledSites.contains("example.com"),
                    "a rejected conflict does not change activation or per-site state");

            String corruptId = "user.corrupt-smoke";
            File corruptFile = new File(new File(root, "browser_extensions"), corruptId + ".daymark-ext.json");
            byte[] corruptBytes = "{not valid JSON".getBytes(StandardCharsets.UTF_8);
            Files.write(corruptFile.toPath(), corruptBytes);
            BrowserExtension recovered = ExtensionPackageParser.parseDaymarkJson(
                    pack(corruptId, "window.recovered = true;", true), false);
            expectMalformedFailure(store, recovered);
            check(Arrays.equals(corruptBytes, Files.readAllBytes(corruptFile.toPath())),
                    "a readable but malformed existing extension pack is rejected without replacing its exact bytes");
            check(!new File(corruptFile.getAbsolutePath() + ".tmp").exists(),
                    "a failed malformed-pack import does not leave a partial temporary file");
            ExtensionStore.MalformedUserPack corruptRecord = findMalformed(store,
                    corruptFile.getName());
            check(ExtensionStore.MalformedUserPack.STATE_MALFORMED.equals(corruptRecord.state)
                            && corruptRecord.canExport && corruptRecord.canRemove,
                    "readable malformed pack appears as a disabled recovery record with explicit safe actions");
            check(Arrays.equals(corruptBytes, store.readMalformedUserPackBytes(
                            corruptRecord.fileName, corruptRecord.sha256)),
                    "raw malformed-pack export is byte-identical to the original bytes");
            store.removeMalformedUserPack(corruptRecord.fileName, corruptRecord.sha256);
            check(!corruptFile.exists(),
                    "fingerprint-confirmed removal deletes only the selected malformed pack");

            String emptyId = "user.empty-corrupt-smoke";
            File emptyFile = new File(new File(root, "browser_extensions"), emptyId + ".daymark-ext.json");
            Files.write(emptyFile.toPath(), new byte[0]);
            BrowserExtension emptyImport = ExtensionPackageParser.parseDaymarkJson(
                    pack(emptyId, "window.empty = true;", true), false);
            expectMalformedFailure(store, emptyImport);
            check(emptyFile.exists() && emptyFile.length() == 0L,
                    "a readable zero-byte existing pack remains present and byte-for-byte unchanged");
            ExtensionStore.MalformedUserPack emptyRecord = findMalformed(store, emptyFile.getName());
            check(emptyRecord.canExport && emptyRecord.canRemove
                            && store.readMalformedUserPackBytes(emptyRecord.fileName, emptyRecord.sha256).length == 0,
                    "zero-byte malformed pack is surfaced and exported as exactly zero bytes");
            store.removeMalformedUserPack(emptyRecord.fileName, emptyRecord.sha256);
            check(!emptyFile.exists(), "fingerprint-confirmed removal can remove a zero-byte malformed pack");

            String oversizedId = "user.oversized-smoke";
            File oversizedFile = new File(new File(root, "browser_extensions"), oversizedId + ".daymark-ext.json");
            byte[] oversizedBytes = new byte[200_001];
            Arrays.fill(oversizedBytes, (byte) 'x');
            Files.write(oversizedFile.toPath(), oversizedBytes);
            BrowserExtension oversizedImport = ExtensionPackageParser.parseDaymarkJson(
                    pack(oversizedId, "window.oversized = true;", true), false);
            expectReadFailure(store, oversizedImport);
            check(Arrays.equals(oversizedBytes, Files.readAllBytes(oversizedFile.toPath())),
                    "an oversized existing extension file is rejected without truncation or replacement");
            ExtensionStore.MalformedUserPack oversizedRecord = findMalformed(store, oversizedFile.getName());
            check(ExtensionStore.MalformedUserPack.STATE_OVERSIZED.equals(oversizedRecord.state)
                            && !oversizedRecord.canExport && !oversizedRecord.canRemove,
                    "oversized pack is visible as non-actionable recovery metadata");
            expectRecoveryReadFailure(store, oversizedRecord.fileName, oversizedRecord.sha256);
            expectRecoveryRemoveFailure(store, oversizedRecord.fileName, oversizedRecord.sha256);
            check(Arrays.equals(oversizedBytes, Files.readAllBytes(oversizedFile.toPath())),
                    "rejected oversized recovery actions preserve the exact original bytes");

            String unreadableId = "user.unreadable-smoke";
            File unreadablePath = new File(new File(root, "browser_extensions"), unreadableId + ".daymark-ext.json");
            Files.createDirectory(unreadablePath.toPath());
            File marker = new File(unreadablePath, "preserve.txt");
            byte[] markerBytes = "preserve-existing-pack".getBytes(StandardCharsets.UTF_8);
            Files.write(marker.toPath(), markerBytes);
            BrowserExtension unreadableImport = ExtensionPackageParser.parseDaymarkJson(
                    pack(unreadableId, "window.unreadable = true;", true), false);
            expectReadFailure(store, unreadableImport);
            check(unreadablePath.isDirectory() && marker.exists()
                            && Arrays.equals(markerBytes, Files.readAllBytes(marker.toPath())),
                    "an unreadable existing extension path and its contents are preserved");
            ExtensionStore.MalformedUserPack nonRegularRecord = findMalformed(store, unreadablePath.getName());
            check(ExtensionStore.MalformedUserPack.STATE_NON_REGULAR.equals(nonRegularRecord.state)
                            && !nonRegularRecord.canExport && !nonRegularRecord.canRemove,
                    "non-regular extension paths are visible but never exported or removed");
            expectRecoveryReadFailure(store, nonRegularRecord.fileName, nonRegularRecord.sha256);
            expectRecoveryRemoveFailure(store, nonRegularRecord.fileName, nonRegularRecord.sha256);

            String binaryId = "user.binary-smoke";
            File binaryFile = new File(new File(root, "browser_extensions"), binaryId + ".daymark-ext.json");
            byte[] binaryBytes = new byte[] {(byte) 0xff, 0x00, 0x7b, 0x00};
            Files.write(binaryFile.toPath(), binaryBytes);
            ExtensionStore.MalformedUserPack binaryRecord = findMalformed(store, binaryFile.getName());
            check(binaryRecord.canExport && Arrays.equals(binaryBytes,
                            store.readMalformedUserPackBytes(binaryRecord.fileName, binaryRecord.sha256)),
                    "invalid UTF-8 malformed packs can be exported byte-for-byte without text normalization");
            store.removeMalformedUserPack(binaryRecord.fileName, binaryRecord.sha256);
            check(!binaryFile.exists(), "confirmed recovery removal removes the selected invalid-UTF-8 pack");

            String changedId = "user.changed-smoke";
            File changedFile = new File(new File(root, "browser_extensions"), changedId + ".daymark-ext.json");
            byte[] listedBytes = "{bad-one".getBytes(StandardCharsets.UTF_8);
            byte[] replacementBytes = "{bad-two".getBytes(StandardCharsets.UTF_8);
            Files.write(changedFile.toPath(), listedBytes);
            ExtensionStore.MalformedUserPack changedRecord = findMalformed(store, changedFile.getName());
            Files.write(changedFile.toPath(), replacementBytes);
            expectRecoveryReadFailure(store, changedRecord.fileName, changedRecord.sha256);
            expectRecoveryRemoveFailure(store, changedRecord.fileName, changedRecord.sha256);
            check(Arrays.equals(replacementBytes, Files.readAllBytes(changedFile.toPath())),
                    "a pack changed after listing is neither exported under a stale fingerprint nor deleted");

            String targetId = "user.symlink-target";
            File targetFile = new File(root, targetId + ".txt");
            byte[] targetBytes = "do-not-follow-symlink".getBytes(StandardCharsets.UTF_8);
            Files.write(targetFile.toPath(), targetBytes);
            String symlinkId = "user.symlink-smoke";
            File symlinkFile = new File(new File(root, "browser_extensions"), symlinkId + ".daymark-ext.json");
            Files.createSymbolicLink(symlinkFile.toPath(), targetFile.toPath());
            ExtensionStore.MalformedUserPack symlinkRecord = findMalformed(store, symlinkFile.getName());
            check(ExtensionStore.MalformedUserPack.STATE_NON_REGULAR.equals(symlinkRecord.state)
                            && !symlinkRecord.canExport && !symlinkRecord.canRemove,
                    "symbolic links are listed as non-regular and are never followed");
            expectRecoveryReadFailure(store, symlinkRecord.fileName, symlinkRecord.sha256);
            expectRecoveryRemoveFailure(store, symlinkRecord.fileName, symlinkRecord.sha256);
            check(Files.isSymbolicLink(symlinkFile.toPath())
                            && Arrays.equals(targetBytes, Files.readAllBytes(targetFile.toPath())),
                    "rejected symlink recovery actions preserve both link and target");
            check(store.listAll().stream().noneMatch(extension -> symlinkId.equals(extension.id)),
                    "symlinked extension packs are never loaded into the executable extension list");
            BrowserExtension symlinkImport = ExtensionPackageParser.parseDaymarkJson(
                    pack(symlinkId, "window.symlink = true;", true), false);
            expectReadFailure(store, symlinkImport);
            store.uninstallUserPack(symlinkId);
            check(Files.isSymbolicLink(symlinkFile.toPath())
                            && Arrays.equals(targetBytes, Files.readAllBytes(targetFile.toPath())),
                    "legacy install/uninstall paths also preserve symlink and target bytes");

            // A symlinked parent directory must not expose a valid pack stored outside userDir.
            File userDirectory = new File(root, "browser_extensions");
            File externalDirectory = new File(root, "external_browser_extensions");
            if (!userDirectory.exists() && !Files.isSymbolicLink(userDirectory.toPath())) {
                throw new AssertionError("expected the original user extension directory to exist");
            }
            deleteTree(userDirectory);
            check(!Files.exists(userDirectory.toPath(), java.nio.file.LinkOption.NOFOLLOW_LINKS),
                    "the original private extension directory was removed before parent-symlink test");
            Files.createDirectory(externalDirectory.toPath());
            String parentSymlinkId = "user.parent-symlink";
            File externalPack = new File(externalDirectory, parentSymlinkId + ".daymark-ext.json");
            byte[] externalPackBytes = pack(parentSymlinkId, "window.parentSymlink = true;", true)
                    .getBytes(StandardCharsets.UTF_8);
            Files.write(externalPack.toPath(), externalPackBytes);
            Files.createSymbolicLink(userDirectory.toPath(), externalDirectory.toPath());
            ExtensionStore reloadedStore = new ExtensionStore(context);
            check(Files.isSymbolicLink(userDirectory.toPath()),
                    "store construction never follows or replaces a symlinked private extension directory");
            check(reloadedStore.listAll().stream().noneMatch(extension -> parentSymlinkId.equals(extension.id)),
                    "a valid pack behind a symlinked parent directory is never loaded for execution");
            check(reloadedStore.userPackJson(parentSymlinkId) == null,
                    "user-pack lookup fails closed when the private directory is a symlink");
            BrowserExtension parentSymlinkImport = ExtensionPackageParser.parseDaymarkJson(
                    pack(parentSymlinkId, "window.replacement = true;", true), false);
            expectUnsafeDirectoryInstall(reloadedStore, parentSymlinkImport);
            reloadedStore.uninstallUserPack(parentSymlinkId);
            expectDirectoryRecoveryFailure(reloadedStore);
            expectRecoveryReadFailure(reloadedStore, parentSymlinkId + ".daymark-ext.json", "0".repeat(64));
            expectRecoveryRemoveFailure(reloadedStore, parentSymlinkId + ".daymark-ext.json", "0".repeat(64));
            check(Files.isSymbolicLink(userDirectory.toPath())
                            && Arrays.equals(externalPackBytes, Files.readAllBytes(externalPack.toPath())),
                    "all parent-symlink recovery, install and uninstall attempts preserve the external pack bytes");

            System.out.println("PASS: ExtensionStoreSmoke: disabled imports, conflict preservation, malformed-pack listing, exact-byte export, fingerprint-checked removal and fail-closed file/parent symlink paths ("
                    + assertions + " assertions)");
        } finally {
            deleteTree(root);
        }
    }

    private static void expectUnsafeDirectoryInstall(ExtensionStore store, BrowserExtension ext) throws Exception {
        assertions++;
        try {
            store.installUserPack(ext);
            throw new AssertionError("expected install into a symlinked private directory to fail closed");
        } catch (IOException expected) {
            if (!expected.getMessage().contains("Private extension pack directory")) {
                throw new AssertionError("unsafe directory must be reported before import", expected);
            }
        }
    }

    private static void expectDirectoryRecoveryFailure(ExtensionStore store) throws Exception {
        assertions++;
        try {
            store.listMalformedUserPacks();
            throw new AssertionError("expected recovery enumeration of a symlinked private directory to fail closed");
        } catch (IOException expected) {
            if (!expected.getMessage().contains("Private extension pack directory")) {
                throw new AssertionError("unsafe directory must be reported as unavailable", expected);
            }
        }
    }

    private static ExtensionStore.MalformedUserPack findMalformed(ExtensionStore store, String fileName) throws Exception {
        List<ExtensionStore.MalformedUserPack> records = store.listMalformedUserPacks();
        for (ExtensionStore.MalformedUserPack record : records) {
            if (fileName.equals(record.fileName)) return record;
        }
        throw new AssertionError("malformed recovery record is missing: " + fileName);
    }

    private static void expectRecoveryReadFailure(ExtensionStore store, String fileName, String fingerprint) throws Exception {
        assertions++;
        try {
            store.readMalformedUserPackBytes(fileName, fingerprint);
            throw new AssertionError("expected unsafe or changed recovery export to fail closed: " + fileName);
        } catch (IOException expected) {
            // Unsafe, oversized, non-regular or stale records are not exportable.
        }
    }

    private static void expectRecoveryRemoveFailure(ExtensionStore store, String fileName, String fingerprint) throws Exception {
        assertions++;
        try {
            store.removeMalformedUserPack(fileName, fingerprint);
            throw new AssertionError("expected unsafe or changed recovery removal to fail closed: " + fileName);
        } catch (IOException expected) {
            // Unsafe, oversized, non-regular or stale records are not removable.
        }
    }

    private static BrowserExtension stored(ExtensionStore store, String id) throws Exception {
        String json = store.userPackJson(id);
        if (json == null) throw new AssertionError("stored pack is missing: " + id);
        return ExtensionPackageParser.parseDaymarkJson(json, false);
    }

    private static String pack(String id, String js, boolean enabled) {
        return "{\"id\":\"" + id + "\",\"name\":\"Store smoke\",\"version\":\"1.0.0\","
                + "\"description\":\"\",\"enabled\":" + enabled + ","
                + "\"matches\":[\"https://example.com/*\"],\"excludes\":[],"
                + "\"disabledSites\":[],\"css\":\"\",\"js\":\"" + js + "\","
                + "\"runAt\":\"document_end\"}";
    }

    private static void expectConflict(ExtensionStore store, BrowserExtension ext) throws Exception {
        assertions++;
        try {
            store.installUserPack(ext);
            throw new AssertionError("expected a different script under the same id to be rejected");
        } catch (IllegalArgumentException expected) {
            // Conflict correctly rejected.
        }
    }

    private static void expectMalformedFailure(ExtensionStore store, BrowserExtension ext) throws Exception {
        assertions++;
        try {
            store.installUserPack(ext);
            throw new AssertionError("expected a readable malformed existing extension pack to be preserved");
        } catch (IOException expected) {
            if (!expected.getMessage().contains("malformed; refusing to replace it")) {
                throw new AssertionError("malformed pack must be reported as a preservation refusal", expected);
            }
        }
    }

    private static void expectReadFailure(ExtensionStore store, BrowserExtension ext) throws Exception {
        assertions++;
        try {
            store.installUserPack(ext);
            throw new AssertionError("expected an unreadable existing extension path to be preserved");
        } catch (IOException expected) {
            if (!expected.getMessage().contains("refusing to replace it")) {
                throw new AssertionError("read failure must be reported as a preservation refusal", expected);
            }
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteTree(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
