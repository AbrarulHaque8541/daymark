package com.abrar.daymark;

import java.util.Arrays;
import java.util.Collections;

public final class BrowserAddressNoticeSmoke {
    public static void main(String[] args) {
        BrowserAddressNotice notices = new BrowserAddressNotice();
        assert notices.presentation() == BrowserAddressNotice.Presentation.HIDDEN;
        assert notices.current() == null;
        assert !notices.openPanel();

        BrowserAddressNotice.Notice http = new BrowserAddressNotice.Notice(
                "http-origin-example", "Connection is not encrypted",
                "This site uses HTTP. Information may be visible to the network.",
                BrowserAddressNotice.Severity.WARNING, true,
                Arrays.asList(new BrowserAddressNotice.Action("continue", "Continue"),
                        new BrowserAddressNotice.Action("go-back", "Go back")));
        assert notices.show(http);
        assert notices.presentation() == BrowserAddressNotice.Presentation.INLINE;
        assert !notices.show(http) : "duplicate notice delivery must be suppressed";
        assert notices.openPanel();
        assert notices.presentation() == BrowserAddressNotice.Presentation.PANEL;
        assert notices.collapsePanel();
        assert notices.presentation() == BrowserAddressNotice.Presentation.INLINE;
        assert notices.onInlineTimeout();
        assert notices.current() == null;
        assert notices.presentation() == BrowserAddressNotice.Presentation.HIDDEN;

        BrowserAddressNotice.Notice permission = new BrowserAddressNotice.Notice(
                "camera-example", "Camera permission",
                "This site wants to use the camera.",
                BrowserAddressNotice.Severity.INFO, true,
                Collections.singletonList(new BrowserAddressNotice.Action("block", "Block")));
        assert notices.show(permission);
        assert notices.dismiss();
        assert !notices.resolve("camera-example");

        BrowserAddressNotice.Notice tls = new BrowserAddressNotice.Notice(
                "tls-example", "Secure connection unavailable",
                "Daymark could not verify this site's certificate.",
                BrowserAddressNotice.Severity.CRITICAL, true,
                Collections.singletonList(new BrowserAddressNotice.Action("leave", "Leave site")));
        assert !tls.dismissible : "critical notices must override requested dismissibility";
        assert notices.show(tls);
        assert !notices.dismiss() : "critical notice cannot be generically dismissed";
        assert !notices.onInlineTimeout() : "critical notice cannot auto-dismiss";
        BrowserAddressNotice.Notice laterInfo = new BrowserAddressNotice.Notice(
                "later-info", "Page information", "A later informational event.",
                BrowserAddressNotice.Severity.INFO, true, Collections.emptyList());
        assert !notices.show(laterInfo)
                : "an unresolved critical notice must not be displaced by a later event";
        assert notices.current() == tls;
        assert notices.openPanel();
        assert notices.resolve("another-notice") == false;
        assert notices.current() == tls;
        assert notices.resolve("tls-example");
        assert notices.presentation() == BrowserAddressNotice.Presentation.HIDDEN;
        assert notices.show(laterInfo) : "new notices may appear after critical resolution";
        assert notices.current() == laterInfo;
        assert notices.dismiss();

        boolean rejected = false;
        try {
            new BrowserAddressNotice.Notice("bad", "Bad", "Bad", null, true, null);
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        assert rejected : "notice severity must be explicit";

        rejected = false;
        try {
            new BrowserAddressNotice.Notice("bad-actions", "Bad", "Bad",
                    BrowserAddressNotice.Severity.INFO, true,
                    Arrays.asList(new BrowserAddressNotice.Action("same", "One"),
                            new BrowserAddressNotice.Action("same", "Two")));
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        assert rejected : "action ids must be unique";
        System.out.println("PASS address-bar notice state: inline/panel, duplicate suppression, timeout, critical persistence, replacement guard and explicit resolution");
    }
}
