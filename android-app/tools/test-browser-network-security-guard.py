#!/usr/bin/env python3
"""Mutation-test the browser network/security source guard without editing the worktree."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
checker = root / "tools/check-browser-network-security.py"
files = [
    "app/src/main/AndroidManifest.xml",
    "app/src/main/java/com/abrar/daymark/BrowserHttpPolicy.java",
    "app/src/main/java/com/abrar/daymark/DaymarkWebView.java",
    "app/src/main/java/com/abrar/daymark/BrowserHttpsDownloader.java",
    "app/src/main/java/com/abrar/daymark/GitHubPublicIssuesClient.java",
    "app/src/main/java/com/abrar/daymark/TaskWebhookClient.java",
    "app/src/main/java/com/abrar/daymark/updater/GitHubReleaseClient.java",
    "app/src/main/java/com/abrar/daymark/updater/GitHubApkDownloader.java",
    "app/src/main/java/com/abrar/daymark/MainActivity.java",
    "app/src/play/AndroidManifest.xml",
    "app/src/githubSideload/AndroidManifest.xml",
    "tools/BrowserHttpPolicySmoke.java",
    "tools/BrowserHttpsDownloaderSmoke.java",
    "tools/GitHubPublicIssuesClientSmoke.java",
    "tools/TaskWebhookClientSmoke.java",
    "tools/GitHubTransportSmoke.java",
    "tools/run-core-tests.sh",
]


def fixture(destination: Path) -> None:
    for name in files:
        source = root / name
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def run(copy: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(checker), str(copy)], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def mutate_and_expect_failure(relative: str, old: str, new: str, label: str) -> None:
    with tempfile.TemporaryDirectory(prefix="daymark-browser-network-guard-") as temporary:
        copy = Path(temporary)
        fixture(copy)
        path = copy / relative
        text = path.read_text(encoding="utf-8")
        assert text.count(old) == 1, f"expected one mutation anchor in {relative}: {old}"
        path.write_text(text.replace(old, new, 1), encoding="utf-8")
        result = run(copy)
        assert result.returncode != 0, f"guard accepted {label}: {result.stdout}"


with tempfile.TemporaryDirectory(prefix="daymark-browser-network-guard-") as temporary:
    baseline = Path(temporary)
    fixture(baseline)
    result = run(baseline)
    assert result.returncode == 0, f"unaltered source must pass: {result.stdout}\n{result.stderr}"

mutate_and_expect_failure(
    "app/src/main/AndroidManifest.xml", 'android:usesCleartextTraffic="false"',
    'android:usesCleartextTraffic="true"', "enabling app-wide cleartext before integration")
mutate_and_expect_failure(
    "app/src/main/java/com/abrar/daymark/BrowserHttpsDownloader.java",
    "connection.setInstanceFollowRedirects(false);",
    "connection.setInstanceFollowRedirects(true);", "automatic downloader redirects")
mutate_and_expect_failure(
    "app/src/main/java/com/abrar/daymark/BrowserHttpsDownloader.java",
    "headers.clear();", 'headers.remove("Authorization");',
    "preserving arbitrary caller headers after a cross-origin redirect")
mutate_and_expect_failure(
    "app/src/main/java/com/abrar/daymark/DaymarkWebView.java",
    "handler.cancel();", "handler.proceed();", "accepting WebView TLS errors")

print("PASS browser network/security guard mutations: manifest, redirect, caller headers, TLS")
