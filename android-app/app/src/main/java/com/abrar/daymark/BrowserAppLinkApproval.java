package com.abrar.daymark;

import java.net.IDN;
import java.util.Locale;
import java.util.Map;

/**
 * Fail-closed gate for direct HTTP(S) App Link handoff.
 *
 * <p>A matching/default Intent filter is not proof that Android verified the
 * domain or that the user selected the app. On API 31+, require the platform's
 * per-host VERIFIED or user-SELECTED state and its link-handling switch.
 * Older Android versions do not expose equivalent public approval state, so
 * keep the URL in Daymark rather than silently launching an unverified app.
 */
final class BrowserAppLinkApproval {
    static final int API_S = 31;
    static final int DOMAIN_STATE_NONE = 0;
    static final int DOMAIN_STATE_SELECTED = 1;
    static final int DOMAIN_STATE_VERIFIED = 2;

    private BrowserAppLinkApproval() { }

    static boolean isApproved(int sdkInt, boolean linkHandlingAllowed,
                             String host, Map<String, Integer> hostStates) {
        if (sdkInt < API_S || !linkHandlingAllowed || hostStates == null) return false;
        String normalizedHost = normalizeHost(host);
        if (normalizedHost == null) return false;

        Integer state = null;
        for (Map.Entry<String, Integer> entry : hostStates.entrySet()) {
            if (!normalizedHost.equals(normalizeHost(entry.getKey()))) continue;
            Integer candidate = entry.getValue();
            if (state != null && !state.equals(candidate)) return false;
            state = candidate;
        }
        return state != null && (state == DOMAIN_STATE_VERIFIED
                || state == DOMAIN_STATE_SELECTED);
    }

    private static String normalizeHost(String host) {
        if (host == null || host.isEmpty() || host.length() > 253
                || host.indexOf(':') >= 0 || host.indexOf('/') >= 0
                || host.indexOf('*') >= 0) return null;
        String withoutRootDot = host.endsWith(".") ? host.substring(0, host.length() - 1) : host;
        if (withoutRootDot.isEmpty()) return null;
        try {
            String ascii = IDN.toASCII(withoutRootDot, IDN.USE_STD3_ASCII_RULES)
                    .toLowerCase(Locale.ROOT);
            return ascii.isEmpty() || ascii.length() > 253 ? null : ascii;
        } catch (IllegalArgumentException invalidHost) {
            return null;
        }
    }
}
