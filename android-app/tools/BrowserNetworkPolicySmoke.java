package com.abrar.daymark;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * JDK-only regression checks for the browser's user-controlled network mode.
 * When passed the shared TSV path, this also runs the cross-platform contract cases.
 */
public final class BrowserNetworkPolicySmoke {
    private BrowserNetworkPolicySmoke() { }

    public static void main(String[] args) throws IOException {
        BrowserNetworkPolicy policy = new BrowserNetworkPolicy();
        assert !policy.isOnlineEnabled() : "fresh installs must start Offline";
        assert !policy.allowsRemoteLoads() : "fresh installs must block remote loads";
        assert policy.shouldBlockWebViewLoads() : "fresh installs must block WebView resources";

        assert !BrowserNetworkPolicy.hasExplicitOptIn(false, false)
                : "missing preferences must remain Offline";
        assert !BrowserNetworkPolicy.hasExplicitOptIn(true, false)
                : "a legacy default-Online preference without consent must remain Offline";
        assert !BrowserNetworkPolicy.hasExplicitOptIn(false, true)
                : "a consent marker without an Online choice must remain Offline";
        assert BrowserNetworkPolicy.hasExplicitOptIn(true, true)
                : "only a saved Online choice with an explicit-consent marker may enable browsing";

        policy.setOnlineEnabled(true);
        assert policy.isOnlineEnabled() : "explicitly accepted Online choice should enable browsing";
        assert policy.allowsRemoteLoads() : "Online mode should permit user-initiated loads";
        assert !policy.shouldBlockWebViewLoads() : "Online mode should unblock WebView loads";

        BrowserNetworkPolicy restored = new BrowserNetworkPolicy(
                BrowserNetworkPolicy.hasExplicitOptIn(true, true));
        assert restored.isOnlineEnabled() : "a consented saved choice should be restorable";
        restored.setOnlineEnabled(false);
        assert !restored.isOnlineEnabled() : "the user can switch online browsing off";
        assert !restored.allowsRemoteLoads() : "turning Offline blocks future remote loads";
        assert restored.shouldBlockWebViewLoads() : "turning Offline blocks WebView resources";

        if (args.length > 0) {
            runSharedContract(Path.of(args[0]));
        }
        System.out.println("PASS browser network policy: fresh Offline default, explicit-consent restoration, legacy-online fail-closed behavior, page/resource-load blocking"
                + (args.length > 0 ? ", shared cross-platform fixtures" : ""));
    }

    private static void runSharedContract(Path fixture) throws IOException {
        int cases = 0;
        try (BufferedReader reader = Files.newBufferedReader(fixture, StandardCharsets.UTF_8)) {
            String line;
            int lineNumber = 0;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                String[] fields = trimmed.split("\\t", -1);
                if (fields.length != 5) {
                    throw new AssertionError("Invalid shared browser policy fixture at line " + lineNumber);
                }
                boolean savedChoice = parseBoolean(fields[0], lineNumber);
                boolean savedConsent = parseBoolean(fields[1], lineNumber);
                boolean expectedOptIn = parseBoolean(fields[2], lineNumber);
                boolean expectedRemoteLoads = parseBoolean(fields[3], lineNumber);
                boolean expectedBlockLoads = parseBoolean(fields[4], lineNumber);

                boolean actualOptIn = BrowserNetworkPolicy.hasExplicitOptIn(savedChoice, savedConsent);
                assert actualOptIn == expectedOptIn : "explicit opt-in mismatch at fixture line " + lineNumber;
                BrowserNetworkPolicy actualPolicy = new BrowserNetworkPolicy(actualOptIn);
                assert actualPolicy.allowsRemoteLoads() == expectedRemoteLoads
                        : "remote-load decision mismatch at fixture line " + lineNumber;
                assert actualPolicy.shouldBlockWebViewLoads() == expectedBlockLoads
                        : "block-load decision mismatch at fixture line " + lineNumber;
                cases++;
            }
        }
        assert cases == 4 : "shared browser policy fixture must contain exactly four truth-table cases";
    }

    private static boolean parseBoolean(String value, int lineNumber) {
        if ("true".equals(value)) return true;
        if ("false".equals(value)) return false;
        throw new AssertionError("Invalid boolean in shared browser policy fixture at line " + lineNumber);
    }
}
