#!/usr/bin/env python3
"""Guard extension imports (issues #190, #192, #193, #194) and rule limits.

The guard also mutation-tests the limit checks in memory. No source files,
including shared activity/UI files, are modified by these meta-tests.
"""
from pathlib import Path
import subprocess
import sys


def check_sources(parser, store, smoke):
    archive = parser.split("static BrowserExtension parseWebExtensionArchive", 1)[1].split(
        "private static BrowserExtension buildWebExtension", 1)[0]
    build = parser.split("private static BrowserExtension buildWebExtension", 1)[1].split(
        "private static List<String> readValidatedPatterns", 1)[0]
    patterns = parser.split("private static List<String> readValidatedPatterns", 1)[1].split(
        "static boolean isSupportedMatchPattern", 1)[0]
    install = store.split("void installUserPack", 1)[1].split("private File findUserPack", 1)[0]
    reader = store.split("private static String readFile", 1)[1].split("private static synchronized void writeFile", 1)[0]
    list_all = store.split("List<BrowserExtension> listAll()", 1)[1].split(
        "List<BrowserExtension> enabledMatching", 1)[0]
    find_user = store.split("private File findUserPack", 1)[1].split(
        "void uninstallUserPack", 1)[0]
    uninstall = store.split("void uninstallUserPack", 1)[1].split(
        "private boolean isBuiltinDisabled", 1)[0]
    writer = store.split("private static synchronized void writeFile", 1)[1]

    # The private pack directory itself is a trust boundary; file-level NOFOLLOW is insufficient.
    constructor = store.split("ExtensionStore(Context context)", 1)[1].split(
        "private boolean isSafeUserDirectory", 1)[0]
    assert (
        "Files.exists(directory, LinkOption.NOFOLLOW_LINKS)" in constructor
        and "Files.createDirectory(directory)" in constructor
        and "userDir.mkdirs()" not in constructor
    ), "constructor must not follow a pre-existing private-directory symlink"
    assert "if (!isSafeUserDirectory()) return new ArrayList<>(byId.values());" in list_all, (
        "listAll must fail closed to built-ins when the user-pack parent directory is unsafe"
    )
    assert "requireSafeUserDirectory();" in install, (
        "imports must reject an unsafe private pack directory before inspecting/replacing files"
    )
    assert "if (id == null || !isSafeUserDirectory()) return null;" in find_user, (
        "user-pack lookup must not traverse an unsafe parent directory"
    )
    assert "!isSafeUserDirectory()" in uninstall, (
        "legacy uninstall must not traverse or delete through an unsafe parent directory"
    )
    assert "!isSafeDirectoryPath(file.getParentFile())" in reader, (
        "runtime reads must reject a symlinked parent directory, not only a symlinked file"
    )
    assert "!isSafeDirectoryPath(file.getParentFile())" in writer, (
        "pack writes must reject a symlinked parent directory"
    )
    assert "parent == null || !isSafeDirectoryPath(parent.toFile())" in store, (
        "recovery reads must revalidate the private parent directory"
    )

    # Existing extension files are bounded and never silently truncated or replaced after I/O failure.
    assert "MAX_USER_PACK_BYTES = 200_000;" in store, "stored extension reads must keep the 200 KB limit"
    assert "if (initialLength > MAX_USER_PACK_BYTES)" in reader, "oversized stored packs must be rejected before reading"
    assert "read > MAX_USER_PACK_BYTES - total" in reader, "streaming read must enforce the byte limit"
    assert "total != initialLength" in reader, "concurrent file changes must not be accepted as complete reads"
    assert "Math.min(file.length()" not in reader, "stored extension reads must not silently truncate"
    assert "Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)" in reader, \
        "runtime extension reads must never follow symlinked pack files"
    assert "Files.exists(out.toPath(), LinkOption.NOFOLLOW_LINKS)" in install, \
        "imports must detect even broken symlinks and refuse to replace them"
    assert "existingJson = readFile(out);" in install, "existing content must be read before parse handling"
    assert "catch (IOException unreadable)" in install, "I/O failures must be surfaced before any replacement"
    assert "refusing to replace it" in install, "unreadable existing packs must be preserved"
    assert "catch (Exception unreadable)" not in install, "read errors must not be swallowed as parse errors"
    assert "catch (Exception malformed)" in install, "readable malformed packs must be distinguished from I/O failures"
    assert 'throw new IOException("Existing extension pack is malformed; refusing to replace it.", malformed);' in install, \
        "readable malformed existing packs must be preserved rather than silently overwritten"

    # issue #190: decompressed budgets across every entry, including skipped file types
    assert "MAX_ARCHIVE_DECOMPRESSED_BYTES" in archive and "MAX_ENTRY_DECOMPRESSED_BYTES" in archive, \
        "archive imports must declare decompressed budgets"
    assert "totalDecompressed += read" in archive, "the decompressed budget must count every entry"
    assert archive.count("totalDecompressed") >= 3, "aggregate accounting must be checked while draining entries"

    # issue #193: collision-resistant ids and a conflict-safe install path
    assert "manifest.toString().hashCode()" not in parser, "32-bit string hashes are not collision-resistant ids"
    assert "raw.hashCode()" not in parser, "userscript ids must not use the 32-bit string hash"
    assert 'MessageDigest.getInstance("SHA-256")' in parser, "imported ids must derive from SHA-256"
    assert 'sha256Hex(manifest.toString() + "\\nCSS:\\n" + css + "\\nJS:\\n" + js)' in parser, \
        "WebExtension ids must include effective CSS/JS, not manifest metadata alone"
    assert "already installed with id" in install, "installing a different pack under an existing id must fail"
    assert install.index("already installed with id") < install.index("writeFile(out, ExtensionPackageParser.toDaymarkJson(ext))"), \
        "the install conflict check must run before the write"
    writer = store.split("private static synchronized void writeFile", 1)[1]
    assert "FileChannel.open(temporary" in writer, "extension writes must use a channel for durable atomic staging"
    assert "StandardOpenOption.CREATE_NEW" in writer and "LinkOption.NOFOLLOW_LINKS" in writer, \
        "extension staging must refuse pre-existing files and symlinks instead of following them"
    assert "out.force(true)" in writer, "staged extension bytes must be flushed before replacement"
    assert "Files.move(temporary, file.toPath(), StandardCopyOption.REPLACE_EXISTING)" in writer, \
        "failed extension saves must preserve the previous pack"
    assert "if (temporaryCreated) Files.deleteIfExists(temporary)" in writer, \
        "failed extension saves must clean up only a temporary path created by this write"
    assert "FileOutputStream" not in writer, "extension writes must not follow a pre-existing temporary symlink"
    assert "file.delete()" not in writer, "failed extension saves must not delete the previous pack"
    assert "ext = ext.withEnabled(existing.enabled).withDisabledSites(existing.disabledSites)" in install, \
        "same-content re-import must preserve enabled state and per-site pause list"

    # issue #687: malformed packs must be discoverable and recoverable without executing or normalizing bytes.
    recovery = store.split("List<MalformedUserPack> listMalformedUserPacks()", 1)[1].split(
        "private File findUserPack", 1)[0]
    assert "Files.readAttributes" in recovery and "LinkOption.NOFOLLOW_LINKS" in recovery, \
        "recovery enumeration must not follow symlinks"
    assert "Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)" in recovery, \
        "raw recovery reads must open the selected regular file without following links"
    assert "MAX_USER_PACK_BYTES" in recovery and "read > MAX_USER_PACK_BYTES - total" in recovery, \
        "raw recovery reads must remain bounded while streaming"
    assert "readStableBytes" in recovery and "Arrays.equals(first, second)" in recovery, \
        "concurrent file changes must fail closed"
    assert "requireSafeUserDirectory();" in recovery, \
        "recovery enumeration and actions must reject a symlinked parent directory"
    assert 'MessageDigest.getInstance("SHA-256")' in recovery, \
        "recovery actions must be bound to a SHA-256 content fingerprint"
    assert "expectedSha256.equals(sha256Hex(bytes))" in recovery, \
        "export/removal must reject a pack changed after it was listed"
    assert "isMalformedPackBytes(bytes)" in recovery, \
        "only still-malformed files may use the malformed-pack recovery actions"
    assert "return bytes.clone();" in recovery, \
        "raw export must return an independent exact-byte copy"
    assert "Files.delete(path);" in recovery, \
        "confirmed recovery removal must delete only the selected verified file"
    assert "private static synchronized void writeFile" in store, \
        "pack writes must share the recovery/removal monitor"
    uninstall = store.split("void uninstallUserPack", 1)[1].split("private boolean isBuiltinDisabled", 1)[0]
    assert "synchronized (ExtensionStore.class)" in uninstall, \
        "explicit uninstall must serialize with fingerprint-checked recovery removal"
    assert "Files.isRegularFile(out.toPath(), LinkOption.NOFOLLOW_LINKS)" in uninstall, \
        "legacy uninstall must not follow or delete non-regular pack paths"
    assert "ExtensionPackageParser.prepareNewUserPackInstall(ext)" in install, \
        "new user imports must be prepared disabled until explicit activation"
    assert "existing.enabled" in install, "identical re-import must retain the user's activation choice"

    # Imported scripts run in the matched page's JavaScript context; surface the same warning for every format.
    assert "IMPORTED_SCRIPT_TRUST_NOTE" in parser, "all imported script formats must use the shared trust disclosure"
    assert "appendWarning(warnings, IMPORTED_SCRIPT_TRUST_NOTE)" in parser, \
        "user-pack JSON storage reads must keep the trust disclosure idempotently"
    assert parser.count("appendWarning(warnings.toString(), IMPORTED_SCRIPT_TRUST_NOTE)") == 2, \
        "userscript and WebExtension imports must both surface the trust disclosure"

    # issue #194: fail-closed match scopes for imported content scripts
    assert 'matches.add("*://*/*")' not in parser, \
        "no imported format may silently default missing scopes to all sites"
    assert 'validateScopePatterns(matches, "Daymark extension matches", true)' in parser, \
        "Daymark JSON imports must require an explicit scope"
    assert 'validateScopePatterns(matches, "Userscript matches", true)' in parser, \
        "userscript imports must require an explicit scope"
    assert "no valid match rules" in build, "content scripts without valid match rules must fail closed"
    assert "isSupportedMatchPattern" in parser, "match patterns must be validated, not trusted"

    # Rule caps are independent per scope list. Raw per-entry length is checked before deduplication.
    assert "private static final int MAX_CONTENT_SCRIPTS = 32;" in parser, "content script cap must remain 32"
    assert "private static final int MAX_MATCH_PATTERNS = 32;" in parser, "pattern cap must remain 32"
    script_check = ('if (scripts.length() > MAX_CONTENT_SCRIPTS) {\n'
                    '            throw new IllegalArgumentException("Extension manifest exceeds the 32 content_scripts limit.");')
    assert script_check in build, "content_scripts overflow must reject while exactly 32 remains accepted"
    script_loop = "for (int i = 0; i < scripts.length(); i++)"
    assert script_loop in build, "content_scripts must not be silently truncated"
    assert build.index(script_check) < build.index(script_loop), "script count must be checked before iteration"
    array_check = ('if (values.length() > MAX_MATCH_PATTERNS) {\n'
                   '            throw new IllegalArgumentException("Content script " + field + " exceeds the 32 patterns per entry limit.");')
    assert array_check in patterns, "raw per-entry pattern overflow must reject while exactly 32 remains accepted"
    array_loop = "for (int i = 0; i < values.length(); i++)"
    assert array_loop in patterns, "entry patterns must not be silently truncated"
    assert patterns.index(array_check) < patterns.index(array_loop), "raw pattern count must be checked before deduplication"
    assert 'addUniquePatterns(matches, entryMatches, "matches");' in build, "aggregate matches must be bounded"
    assert 'addUniquePatterns(excludes, entryExcludes, "exclude_matches");' in build, "aggregate excludes must be bounded"
    unique_add = "if (!target.contains(pattern)) target.add(pattern);"
    aggregate_check = ('if (target.size() > MAX_MATCH_PATTERNS) {\n'
                       '                throw new IllegalArgumentException("Extension manifest exceeds the 32 unique aggregated " + field + " rules limit.");')
    assert unique_add in patterns, "aggregate caps must count unique rules"
    assert aggregate_check in patterns, "aggregate overflow must reject while exactly 32 remains accepted"
    assert patterns.index(unique_add) < patterns.index(aggregate_check), "aggregate count must be checked after adding the unique rule"
    assert "&& i < 32" not in build and ".size() < 32" not in build + patterns, \
        "WebExtension scope processing must never silently truncate"

    # issue #192: honest effective timing
    assert "document_start run timing is not supported" in parser, \
        "imports that request document_start must disclose the effective timing"

    for marker in (
        "webExtensionMatchScopesFailClosed",
        "importedIdsAreStableAndCollisionResistant",
        "different effective JS content under the same manifest gets a different id",
        "documentStartImportsNormalizeToHonestTiming",
        "archiveDecompressedBudgetBoundsIgnoredEntries",
        "the timing disclosure is idempotent and never duplicated",
        "the fixture strings really do collide under String.hashCode()",
        "the aggregate decompressed cap cannot be bypassed by splitting ignored files",
        "webExtensionRuleLimitsFailClosed();",
        "exactly 32 content_scripts are accepted and the final entry is processed",
        "exactly 32 patterns in each entry list remain accepted independently",
        "exactly 32 unique aggregated matches and excludes are accepted",
        "aggregate caps count unique rules, not duplicates across entries",
        '"matches exceeds the 32 patterns per entry limit"',
        '"exclude_matches exceeds the 32 patterns per entry limit"',
        '"32 unique aggregated matches rules limit"',
        '"32 unique aggregated exclude_matches rules limit"',
        "32 repeated patterns are accepted and deduplicated",
        "ExtensionPackageParser.parseWebExtensionArchive(archive)",
        "not an isolated extension sandbox",
        "could send that data to an external service",
        "New imports start disabled",
        "explicit activation",
    ):
        assert marker in smoke, f"missing import-hardening regression: {marker}"


def check_recovery_ui(main):
    manager = main.split("private void showBrowserExtensionsManager()", 1)[1].split(
        "private void showExtensionDetailsDialog", 1
    )[0]
    assert "addMalformedExtensionRecoverySection(content);" in manager, (
        "Extensions manager must expose malformed-pack recovery metadata"
    )
    assert "browserExtensionsDialog.dismiss();" in manager and "browserExtensionsDialog = dialog;" in manager, (
        "refreshing recovery actions must replace the current Extensions dialog, not stack stale copies"
    )
    assert "setOnDismissListener" in manager, "Extensions dialog ownership must clear on dismissal"

    recovery = main.split("private void addMalformedExtensionRecoverySection", 1)[1].split(
        "private void exportMalformedExtensionPack", 1
    )[0]
    assert "listMalformedUserPacks()" in recovery, "manager must enumerate recovery records"
    assert "pack.canExport && pack.sha256 != null" in recovery, (
        "raw export must be offered only for fingerprinted, exportable files"
    )
    assert "pack.canRemove && pack.sha256 != null" in recovery, (
        "removal must be offered only for fingerprinted, removable files"
    )
    assert "Export exact raw bytes" in recovery and "Remove malformed extension file" in recovery, (
        "recovery actions must have accessible descriptions"
    )
    assert "No safe export or removal action is available" in recovery, (
        "unsafe recovery records must remain visible without destructive actions"
    )

    export = main.split("private void exportMalformedExtensionPack", 1)[1].split(
        "private void confirmRemoveMalformedExtensionPack", 1
    )[0]
    assert "Intent.ACTION_CREATE_DOCUMENT" in export and "application/octet-stream" in export, (
        "raw recovery export must use an explicit user-selected document destination"
    )
    assert "pendingMalformedExtensionExportSha256 = pack.sha256;" in export, (
        "raw export must retain the listing fingerprint until the user selects a destination"
    )

    result = main.split("if (requestCode == REQUEST_EXPORT_EXTENSION)", 1)[1].split(
        "if (requestCode == REQUEST_IMPORT_EXTENSION)", 1
    )[0]
    assert "readMalformedUserPackBytes(" in result and "malformedSha256" in result, (
        "raw recovery export must re-read and verify the exact fingerprint after destination selection"
    )
    assert "pendingMalformedExtensionExportFileName = null;" in result and "pendingMalformedExtensionExportSha256 = null;" in result, (
        "pending recovery export state must be cleared on every result path"
    )

    removal = main.split("private void confirmRemoveMalformedExtensionPack", 1)[1].split(
        "private void showExtensionDetailsDialog", 1
    )[0]
    positive_confirmation = removal.find('.setPositiveButton("Remove file"')
    delete_call = removal.find("removeMalformedUserPack(pack.fileName, pack.sha256)")
    assert positive_confirmation >= 0 and delete_call > positive_confirmation, (
        "malformed-pack deletion must occur only inside the explicit positive confirmation"
    )
    assert '.setNegativeButton("Keep file", null)' in removal, (
        "malformed-pack removal must provide a non-destructive cancellation action"
    )
    assert "SHA-256 fingerprint before removal" in removal, (
        "removal confirmation must explain the fingerprint recheck"
    )
    assert main.count("removeMalformedUserPack(") == 1, (
        "malformed-pack removal must have one explicit, confirmed UI call site"
    )


def test_recovery_ui_guard_mutations(main):
    """Prove recovery UI safeguards fail closed when their wiring is removed."""
    mutations = [
        (
            "raw export fingerprint check removed",
            "readMalformedUserPackBytes(",
            "userPackJson(",
            "raw recovery export must re-read and verify the exact fingerprint",
        ),
        (
            "removal confirmation removed",
            '.setPositiveButton("Remove file"',
            '.setPositiveButton("Remove now"',
            "malformed-pack deletion must occur only inside the explicit positive confirmation",
        ),
        (
            "export accessibility removed",
            'setContentDescription("Export exact raw bytes',
            'setText("Export exact raw bytes',
            "recovery actions must have accessible descriptions",
        ),
    ]
    for name, before, after, diagnostic in mutations:
        assert main.count(before) == 1, f"UI mutation fixture must match once: {name}"
        try:
            check_recovery_ui(main.replace(before, after, 1))
        except AssertionError as rejected:
            assert diagnostic in str(rejected), f"{name} failed for an unrelated reason: {rejected}"
        else:
            raise AssertionError(f"recovery UI guard accepted mutation: {name}")


def test_limit_guard_mutations(parser, store, smoke):
    """Prove each new guard rejects a targeted regression, not an unrelated error."""
    mutations = [
        ("script cap raised", "MAX_CONTENT_SCRIPTS = 32;", "MAX_CONTENT_SCRIPTS = 33;", "content script cap must remain 32"),
        ("pattern cap raised", "MAX_MATCH_PATTERNS = 32;", "MAX_MATCH_PATTERNS = 33;", "pattern cap must remain 32"),
        ("script rejection removed", "scripts.length() > MAX_CONTENT_SCRIPTS", "false", "content_scripts overflow must reject"),
        ("32 scripts rejected", "scripts.length() > MAX_CONTENT_SCRIPTS", "scripts.length() >= MAX_CONTENT_SCRIPTS", "content_scripts overflow must reject"),
        ("script truncation restored", "i < scripts.length();", "i < scripts.length() && i < 32;", "content_scripts must not be silently truncated"),
        ("entry rejection removed", "values.length() > MAX_MATCH_PATTERNS", "false", "raw per-entry pattern overflow must reject"),
        ("32 patterns rejected", "values.length() > MAX_MATCH_PATTERNS", "values.length() >= MAX_MATCH_PATTERNS", "raw per-entry pattern overflow must reject"),
        ("pattern truncation restored", "i < values.length(); i++) {\n            String value =", "i < values.length() && out.size() < 32; i++) {\n            String value =", "entry patterns must not be silently truncated"),
        ("match aggregation bypassed", 'addUniquePatterns(matches, entryMatches, "matches");', "matches.addAll(entryMatches);", "aggregate matches must be bounded"),
        ("exclude aggregation bypassed", 'addUniquePatterns(excludes, entryExcludes, "exclude_matches");', "excludes.addAll(entryExcludes);", "aggregate excludes must be bounded"),
        ("aggregate duplicates counted", "if (!target.contains(pattern)) target.add(pattern);", "target.add(pattern);", "aggregate caps must count unique rules"),
        ("aggregate rejection removed", "target.size() > MAX_MATCH_PATTERNS", "false", "aggregate overflow must reject"),
        ("32 aggregate rules rejected", "target.size() > MAX_MATCH_PATTERNS", "target.size() >= MAX_MATCH_PATTERNS", "aggregate overflow must reject"),
        ("aggregate truncation restored", "if (!target.contains(pattern)) target.add(pattern);", "if (target.size() < 32 && !target.contains(pattern)) target.add(pattern);", "aggregate caps must count unique rules"),
    ]
    for name, before, after, diagnostic in mutations:
        assert parser.count(before) == 1, f"mutation fixture must match exactly once: {name}"
        try:
            check_sources(parser.replace(before, after, 1), store, smoke)
        except AssertionError as rejected:
            assert diagnostic in str(rejected), f"{name} failed for an unrelated reason: {rejected}"
        else:
            raise AssertionError(f"source guard accepted mutation: {name}")
    marker = "webExtensionRuleLimitsFailClosed();"
    assert smoke.count(marker) == 1, "host regression call must be present exactly once"
    try:
        check_sources(parser, store, smoke.replace(marker, "", 1))
    except AssertionError as rejected:
        assert "missing import-hardening regression" in str(rejected)
    else:
        raise AssertionError("source guard accepted removal of host limit regressions")
    new_install_marker = "ExtensionPackageParser.prepareNewUserPackInstall(ext)"
    assert store.count(new_install_marker) == 1, "new-import activation policy must have one store call site"
    try:
        check_sources(parser, store.replace(new_install_marker, "ext.withEnabled(true)", 1), smoke)
    except AssertionError as rejected:
        assert "new user imports must be prepared disabled" in str(rejected), \
            f"new-import activation regression failed for an unrelated reason: {rejected}"
    else:
        raise AssertionError("source guard accepted removal of the disabled-new-import policy")

    malformed_guard = 'throw new IOException("Existing extension pack is malformed; refusing to replace it.", malformed);'
    assert store.count(malformed_guard) == 1, "malformed-pack preservation guard must be unique"
    try:
        check_sources(parser, store.replace(malformed_guard, "// silently ignore malformed stored pack", 1), smoke)
    except AssertionError as rejected:
        assert "readable malformed existing packs must be preserved" in str(rejected)
    else:
        raise AssertionError("source guard accepted silent replacement of a malformed stored pack")

    size_guard = "if (initialLength > MAX_USER_PACK_BYTES)"
    assert store.count(size_guard) == 1, "stored pack size guard must be unique"
    try:
        check_sources(parser, store.replace(size_guard, "if (false)", 1), smoke)
    except AssertionError as rejected:
        assert "oversized stored packs must be rejected" in str(rejected)
    else:
        raise AssertionError("source guard accepted removal of the stored-pack size limit")

    parent_list_guard = "if (!isSafeUserDirectory()) return new ArrayList<>(byId.values());"
    try:
        check_sources(parser, store.replace(parent_list_guard, "if (false)", 1), smoke)
    except AssertionError as rejected:
        assert "listAll must fail closed to built-ins" in str(rejected)
    else:
        raise AssertionError("source guard accepted removal of the symlinked-parent listAll check")

    parent_read_guard = "!isSafeDirectoryPath(file.getParentFile())"
    assert store.count(parent_read_guard) == 2, "both file read and write paths must verify their parent"
    try:
        check_sources(parser, store.replace(parent_read_guard, "false", 1), smoke)
    except AssertionError as rejected:
        assert "runtime reads must reject a symlinked parent directory" in str(rejected)
    else:
        raise AssertionError("source guard accepted removal of the symlinked-parent read check")
    first_parent, remainder_parent = store.split(parent_read_guard, 1)
    parent_write_mutation = first_parent + parent_read_guard + remainder_parent.replace(parent_read_guard, "false", 1)
    try:
        check_sources(parser, parent_write_mutation, smoke)
    except AssertionError as rejected:
        assert "pack writes must reject a symlinked parent directory" in str(rejected)
    else:
        raise AssertionError("source guard accepted removal of the symlinked-parent write check")

    stream_guard = "if (read > MAX_USER_PACK_BYTES - total)"
    assert store.count(stream_guard) == 2, "both recovery and stored-pack readers must enforce the streaming byte limit"
    try:
        check_sources(parser, store.replace(stream_guard, "if (false)", 1), smoke)
    except AssertionError as rejected:
        assert "raw recovery reads must remain bounded while streaming" in str(rejected)
    else:
        raise AssertionError("source guard accepted removal of the malformed-pack recovery streaming read limit")
    first, remainder = store.split(stream_guard, 1)
    stored_reader_mutation = first + stream_guard + remainder.replace(stream_guard, "if (false)", 1)
    try:
        check_sources(parser, stored_reader_mutation, smoke)
    except AssertionError as rejected:
        assert "streaming read must enforce the byte limit" in str(rejected)
    else:
        raise AssertionError("source guard accepted removal of the stored-pack streaming read limit")

    check_sources(parser, store, smoke)
    print(f"PASS: extension import source-guard mutation tests — {len(mutations) + 2} rejected mutations; unchanged source accepted")


if __name__ == "__main__":
    root = Path(sys.argv[1]).resolve()
    parser = (root / "app/src/main/java/com/abrar/daymark/ExtensionPackageParser.java").read_text(encoding="utf-8")
    store = (root / "app/src/main/java/com/abrar/daymark/ExtensionStore.java").read_text(encoding="utf-8")
    smoke = (root / "tools/ExtensionPackageParserSmoke.java").read_text(encoding="utf-8")
    store_smoke = (root / "tools/ExtensionStoreSmoke.java").read_text(encoding="utf-8")
    main_activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
    check_recovery_ui(main_activity)
    test_recovery_ui_guard_mutations(main_activity)
    for marker in (
        "a readable but malformed existing extension pack is rejected without replacing its exact bytes",
        "a readable zero-byte existing pack remains present and byte-for-byte unchanged",
        "a failed malformed-pack import does not leave a partial temporary file",
        "an oversized existing extension file is rejected without truncation or replacement",
        "an unreadable existing extension path and its contents are preserved",
        "readable malformed pack appears as a disabled recovery record with explicit safe actions",
        "raw malformed-pack export is byte-identical to the original bytes",
        "zero-byte malformed pack is surfaced and exported as exactly zero bytes",
        "oversized pack is visible as non-actionable recovery metadata",
        "non-regular extension paths are visible but never exported or removed",
        "invalid UTF-8 malformed packs can be exported byte-for-byte without text normalization",
        "a pack changed after listing is neither exported under a stale fingerprint nor deleted",
        "symbolic links are listed as non-regular and are never followed",
        "symlinked extension packs are never loaded into the executable extension list",
        "legacy install/uninstall paths also preserve symlink and target bytes",
        "store construction never follows or replaces a symlinked private extension directory",
        "a valid pack behind a symlinked parent directory is never loaded for execution",
        "user-pack lookup fails closed when the private directory is a symlink",
        "all parent-symlink recovery, install and uninstall attempts preserve the external pack bytes",
    ):
        assert marker in store_smoke, f"missing ExtensionStore preservation regression: {marker}"
    check_sources(parser, store, smoke)
    test_limit_guard_mutations(parser, store, smoke)
    subprocess.run(["sh", str(root / "tools/run-extension-store-tests.sh")], cwd=root, check=True)
    print("PASS: extension import hardening — bounded archive/rule budgets, fail-closed scopes, default-disabled imports, and preservation of malformed/unreadable/oversized stored packs")
