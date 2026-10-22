#!/usr/bin/env python3
"""Guard extension imports (issues #190, #192, #193, #194) and rule limits.

The guard also mutation-tests the limit checks in memory. No source files,
including shared activity/UI files, are modified by these meta-tests.
"""
from pathlib import Path
import sys


def check_sources(parser, store, smoke):
    archive = parser.split("static BrowserExtension parseWebExtensionArchive", 1)[1].split(
        "private static BrowserExtension buildWebExtension", 1)[0]
    build = parser.split("private static BrowserExtension buildWebExtension", 1)[1].split(
        "private static List<String> readValidatedPatterns", 1)[0]
    patterns = parser.split("private static List<String> readValidatedPatterns", 1)[1].split(
        "static boolean isSupportedMatchPattern", 1)[0]
    install = store.split("void installUserPack", 1)[1].split("private File findUserPack", 1)[0]

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
    assert install.index("already installed with id") < install.index("writeFile(out, json)"), \
        "the install conflict check must run before the write"
    writer = store.split("private static void writeFile", 1)[1]
    assert "Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)" in writer, \
        "failed extension saves must preserve the previous pack"
    assert "file.delete()" not in writer, "failed extension saves must not delete the previous pack"
    assert "ext = ext.withEnabled(existing.enabled).withDisabledSites(existing.disabledSites)" in install, \
        "same-content re-import must preserve enabled state and per-site pause list"

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
    ):
        assert marker in smoke, f"missing import-hardening regression: {marker}"


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
    check_sources(parser, store, smoke)
    print(f"PASS: extension rule-limit source-guard mutation tests — {len(mutations) + 1} rejected mutations; unchanged source accepted")


if __name__ == "__main__":
    root = Path(sys.argv[1])
    parser = (root / "app/src/main/java/com/abrar/daymark/ExtensionPackageParser.java").read_text(encoding="utf-8")
    store = (root / "app/src/main/java/com/abrar/daymark/ExtensionStore.java").read_text(encoding="utf-8")
    smoke = (root / "tools/ExtensionPackageParserSmoke.java").read_text(encoding="utf-8")
    check_sources(parser, store, smoke)
    test_limit_guard_mutations(parser, store, smoke)
    print("PASS: extension import hardening — bounded archive/rule budgets, SHA-256 ids, fail-closed match scopes, honest effective timing")
