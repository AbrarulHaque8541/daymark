package com.abrar.daymark;

import android.content.Context;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;

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
            Files.write(corruptFile.toPath(), "{not valid JSON".getBytes(StandardCharsets.UTF_8));
            BrowserExtension recovered = ExtensionPackageParser.parseDaymarkJson(
                    pack(corruptId, "window.recovered = true;", true), false);
            store.installUserPack(recovered);
            check(!stored(store, corruptId).enabled,
                    "replacing a readable but corrupt stored import also persists the pack disabled");

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

            System.out.println("PASS: ExtensionStoreSmoke: new/corrupt imports disabled; identical re-import state preserved; conflicts rejected; unreadable/oversized existing packs preserved ("
                    + assertions + " assertions)");
        } finally {
            deleteTree(root);
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
