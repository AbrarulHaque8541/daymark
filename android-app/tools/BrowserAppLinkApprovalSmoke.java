package com.abrar.daymark;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** JDK-only contract tests for Android's public App Link domain approval state. */
public final class BrowserAppLinkApprovalSmoke {
    private BrowserAppLinkApprovalSmoke() { }

    public static void main(String[] args) {
        Map<String, Integer> states = new HashMap<>();
        states.put("verified.example", BrowserAppLinkApproval.DOMAIN_STATE_VERIFIED);
        states.put("selected.example", BrowserAppLinkApproval.DOMAIN_STATE_SELECTED);
        states.put("unapproved.example", BrowserAppLinkApproval.DOMAIN_STATE_NONE);

        check(BrowserAppLinkApproval.isApproved(31, true, "verified.example", states),
                "verified host with link handling enabled may open directly");
        check(BrowserAppLinkApproval.isApproved(35, true, "selected.example", states),
                "explicitly user-selected host may open directly");
        check(!BrowserAppLinkApproval.isApproved(35, true, "unapproved.example", states),
                "unverified and unselected host stays in Daymark");
        check(!BrowserAppLinkApproval.isApproved(35, false, "verified.example", states),
                "user-disabled link handling blocks direct handoff even for verified host");
        check(!BrowserAppLinkApproval.isApproved(35, false, "selected.example", states),
                "global link-handling opt-out blocks selected host");
        check(!BrowserAppLinkApproval.isApproved(30, true, "verified.example", states),
                "pre-Android-12 must fail closed because public approval state is unavailable");
        check(!BrowserAppLinkApproval.isApproved(31, true, "other.example", states),
                "a different host in the same app is not implicitly approved");
        check(!BrowserAppLinkApproval.isApproved(31, true, "verified.example", null),
                "missing platform state fails closed");
        check(!BrowserAppLinkApproval.isApproved(31, true, "verified.example",
                        Collections.emptyMap()),
                "empty platform state fails closed");

        Map<String, Integer> normalized = new HashMap<>();
        normalized.put("BÜCHER.Example.", BrowserAppLinkApproval.DOMAIN_STATE_VERIFIED);
        check(BrowserAppLinkApproval.isApproved(31, true, "bücher.example", normalized),
                "Unicode and root-dot host spelling normalize to the same IDN");
        check(BrowserAppLinkApproval.isApproved(31, true, "VERIFIED.EXAMPLE.", states),
                "case and DNS root dot do not change a host's approval");

        Map<String, Integer> conflicting = new HashMap<>();
        conflicting.put("verified.example", BrowserAppLinkApproval.DOMAIN_STATE_VERIFIED);
        conflicting.put("VERIFIED.EXAMPLE.", BrowserAppLinkApproval.DOMAIN_STATE_NONE);
        check(!BrowserAppLinkApproval.isApproved(31, true, "verified.example", conflicting),
                "conflicting normalized platform entries fail closed");

        for (String invalid : new String[] { null, "", ".", "*", "*.example.com",
                "example.com:443", "example.com/path", "bad host", "a..b" }) {
            check(!BrowserAppLinkApproval.isApproved(31, true, invalid, states),
                    "invalid host must not approve direct handoff: " + invalid);
        }
        check(!BrowserAppLinkApproval.isApproved(31, true, "verified.example",
                        Collections.singletonMap("verified.example", 99)),
                "unknown platform state fails closed");

        System.out.println("PASS BrowserAppLinkApprovalSmoke: API gating, VERIFIED/SELECTED/NONE, user opt-out, exact host and fail-closed normalization");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
