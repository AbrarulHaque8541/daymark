#!/usr/bin/env python3
"""Mutation-test the HTTPS source guard without editing the working tree."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
checker = root / "tools/check-updater-https-only.py"
main = Path("app/src/main")
java = main / "java/com/abrar/daymark"


def run(copy: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(checker), str(copy)], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def changed_file(copy: Path, relative: Path, old: str, new: str) -> None:
    path = copy / relative
    text = path.read_text(encoding="utf-8")
    assert text.count(old) == 1, f"expected one mutation anchor in {relative}: {old}"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def expect_failure(copy: Path, label: str) -> None:
    result = run(copy)
    assert result.returncode != 0, f"guard accepted {label}: {result.stdout}"


with tempfile.TemporaryDirectory(prefix="daymark-updater-guard-") as temporary:
    copy = Path(temporary)
    shutil.copytree(root / java / "updater", copy / java / "updater")
    shutil.copy2(root / java / "BrowserHttpPolicy.java", copy / java / "BrowserHttpPolicy.java")
    shutil.copy2(root / java / "GitHubPublicIssuesClient.java", copy / java / "GitHubPublicIssuesClient.java")
    shutil.copy2(root / java / "TaskWebhookClient.java", copy / java / "TaskWebhookClient.java")
    shutil.copy2(root / main / "AndroidManifest.xml", copy / main / "AndroidManifest.xml")
    assert run(copy).returncode == 0, "unaltered source must pass"

    client = java / "updater/GitHubReleaseClient.java"
    original = (copy / client).read_text(encoding="utf-8")
    anchor = "public final class GitHubReleaseClient implements UpdaterCore.ReleaseClient {"
    changed_file(copy, client, anchor, anchor + '\n    private static final String BAD = "http://untrusted.example/file";')
    expect_failure(copy, "an HTTP URL inside a Java string literal")
    (copy / client).write_text(original, encoding="utf-8")
    changed_file(copy, client, anchor, anchor + '\n    // Comment with http://not-a-request.example\n'
                 + '    /* Another comment: "http://also-not-a-request.example" */')
    assert run(copy).returncode == 0, "comment-only URLs must not be mistaken for Java literals"
    (copy / client).write_text(original, encoding="utf-8")

    downloader = java / "updater/GitHubApkDownloader.java"
    original = (copy / downloader).read_text(encoding="utf-8")
    changed_file(copy, downloader, "connection.setInstanceFollowRedirects(false);",
                 "connection.setInstanceFollowRedirects(true);")
    expect_failure(copy, "automatic updater redirects")
    (copy / downloader).write_text(original, encoding="utf-8")

    webhook = java / "TaskWebhookClient.java"
    original = (copy / webhook).read_text(encoding="utf-8")
    changed_file(copy, webhook, '"https".equalsIgnoreCase(uri.getScheme())',
                 '"http".equalsIgnoreCase(uri.getScheme())')
    expect_failure(copy, "a webhook endpoint without the HTTPS requirement")
    (copy / webhook).write_text(original, encoding="utf-8")

    issues = java / "GitHubPublicIssuesClient.java"
    changed_file(copy, issues, 'return "https://api.github.com/repos/"',
                 'return "http://api.github.com/repos/"')
    expect_failure(copy, "an HTTP public-issues endpoint")

print("PASS updater HTTPS guard mutations: literals, comments, redirects, webhook and GitHub client")
