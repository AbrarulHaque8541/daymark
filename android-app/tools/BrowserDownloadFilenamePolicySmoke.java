package com.abrar.daymark;

import java.nio.charset.StandardCharsets;

/** Regression tests for untrusted browser-download filename sanitization. */
public final class BrowserDownloadFilenamePolicySmoke {
    private BrowserDownloadFilenamePolicySmoke() { }

    public static void main(String[] args) {
        check("report.pdf".equals(BrowserDownloadFilenamePolicy.sanitize("report.pdf")),
                "ordinary filenames should remain unchanged");
        check("_etc_passwd".equals(BrowserDownloadFilenamePolicy.sanitize("../../etc/passwd")),
                "path traversal segments and separators must not survive");
        check("session_token.txt".equals(BrowserDownloadFilenamePolicy.sanitize("session\\token.txt")),
                "Windows path separators must not survive");
        String hostile = "safe\r\nInjected: value" + Character.toString(0x202E) + ".txt";
        check("safeInjected_ value.txt".equals(BrowserDownloadFilenamePolicy.sanitize(hostile)),
                "CR/LF and bidi override controls must be removed and punctuation neutralized");
        check("_CON.txt".equals(BrowserDownloadFilenamePolicy.sanitize("CON.txt")),
                "Windows reserved device names should be neutralized");
        check("download".equals(BrowserDownloadFilenamePolicy.sanitize("...")),
                "dot-only names should fall back to a safe default");
        check("download".equals(BrowserDownloadFilenamePolicy.sanitize(null)),
                "null names should fall back to a safe default");
        check("नमस्ते.txt".equals(BrowserDownloadFilenamePolicy.sanitize("नमस्ते.txt")),
                "safe Unicode names should be preserved");

        String oversized = BrowserDownloadFilenamePolicy.sanitize("😀".repeat(100) + ".txt");
        check(oversized.getBytes(StandardCharsets.UTF_8).length <= 180,
                "UTF-8 output must remain within the common filesystem bound");
        check(!oversized.contains("/") && !oversized.contains("\\")
                        && !oversized.contains("\r") && !oversized.contains("\n"),
                "truncated filename must remain path/control safe");

        System.out.println("BrowserDownloadFilenamePolicySmoke PASS");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
