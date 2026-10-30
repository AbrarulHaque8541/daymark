package com.abrar.daymark;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.TreeMap;

/** Pure policy for showing a safe cookie preview and building explicit WebView Set-Cookie writes. */
final class BrowserCookieImportPolicy {
    static final int MAX_PREVIEW_DOMAINS = 100;

    static final class DomainPreview {
        final String domain;
        final List<BrowserCookieImport.Cookie> cookies;
        final int secureCount;
        final int httpOnlyCount;
        final int sessionCount;

        DomainPreview(String domain, List<BrowserCookieImport.Cookie> source) {
            this.domain = domain;
            this.cookies = Collections.unmodifiableList(new ArrayList<>(source));
            int secure = 0;
            int httpOnly = 0;
            int session = 0;
            for (BrowserCookieImport.Cookie cookie : source) {
                if (cookie.secure) secure++;
                if (cookie.httpOnly) httpOnly++;
                if (cookie.isSessionCookie()) session++;
            }
            this.secureCount = secure;
            this.httpOnlyCount = httpOnly;
            this.sessionCount = session;
        }
    }

    static final class Preview {
        final List<DomainPreview> domains;
        final int importableCookieCount;
        final int expiredCookieCount;
        final int prefixRejectedCookieCount;
        final int rejectedLineCount;
        final boolean rejectionListTruncated;
        final boolean tooManyDomains;

        Preview(List<DomainPreview> domains, int importableCookieCount, int expiredCookieCount,
                int prefixRejectedCookieCount, int rejectedLineCount,
                boolean rejectionListTruncated, boolean tooManyDomains) {
            this.domains = Collections.unmodifiableList(new ArrayList<>(domains));
            this.importableCookieCount = importableCookieCount;
            this.expiredCookieCount = expiredCookieCount;
            this.prefixRejectedCookieCount = prefixRejectedCookieCount;
            this.rejectedLineCount = rejectedLineCount;
            this.rejectionListTruncated = rejectionListTruncated;
            this.tooManyDomains = tooManyDomains;
        }
    }

    private BrowserCookieImportPolicy() { }

    static Preview createPreview(BrowserCookieImport.ParseResult parsed, long nowEpochSeconds) {
        Map<String, List<BrowserCookieImport.Cookie>> grouped = new TreeMap<>();
        int expired = 0;
        int prefixRejected = 0;
        int importable = 0;
        for (BrowserCookieImport.Cookie cookie : parsed.cookies) {
            if (cookie.isExpired(nowEpochSeconds)) {
                expired++;
            } else if (!hasValidPrefixSemantics(cookie)) {
                prefixRejected++;
            } else {
                grouped.computeIfAbsent(cookie.domain, ignored -> new ArrayList<>()).add(cookie);
                importable++;
            }
        }

        boolean tooManyDomains = grouped.size() > MAX_PREVIEW_DOMAINS;
        List<DomainPreview> domains = new ArrayList<>();
        if (!tooManyDomains) {
            for (Map.Entry<String, List<BrowserCookieImport.Cookie>> entry : grouped.entrySet()) {
                domains.add(new DomainPreview(entry.getKey(), entry.getValue()));
            }
        }
        return new Preview(domains, importable, expired, prefixRejected,
                parsed.rejectedLineCount, parsed.rejectionListTruncated, tooManyDomains);
    }

    static List<BrowserCookieImport.Cookie> selectCookies(
            Preview preview, Set<String> selectedDomains) {
        if (preview == null || preview.tooManyDomains || selectedDomains == null
                || selectedDomains.isEmpty()) return Collections.emptyList();
        Set<String> selected = new HashSet<>(selectedDomains);
        List<BrowserCookieImport.Cookie> result = new ArrayList<>();
        for (DomainPreview domain : preview.domains) {
            if (selected.contains(domain.domain)) result.addAll(domain.cookies);
        }
        return Collections.unmodifiableList(result);
    }

    static boolean isImportable(BrowserCookieImport.Cookie cookie, long nowEpochSeconds) {
        return cookie != null && !cookie.isExpired(nowEpochSeconds)
                && cookie.domain != null && BrowserCookieImport.isValidDomain(cookie.domain)
                && cookie.name != null && BrowserCookieImport.isValidName(cookie.name)
                && cookie.value != null && BrowserCookieImport.isValidValue(cookie.value)
                && BrowserCookieImport.isValidPath(cookie.path)
                && hasValidPrefixSemantics(cookie);
    }

    static String targetUrl(BrowserCookieImport.Cookie cookie) {
        return "https://" + cookie.domain + "/";
    }

    static String buildSetCookieHeader(BrowserCookieImport.Cookie cookie, long nowEpochSeconds) {
        if (!isImportable(cookie, nowEpochSeconds)) return null;
        if (!BrowserCookieImport.isValidDomain(cookie.domain)
                || !BrowserCookieImport.isValidName(cookie.name)
                || !BrowserCookieImport.isValidValue(cookie.value)
                || !BrowserCookieImport.isValidPath(cookie.path)) return null;

        StringBuilder header = new StringBuilder(cookie.name.length() + cookie.value.length() + 64);
        header.append(cookie.name).append('=').append(cookie.value);
        if (cookie.includeSubdomains) header.append("; Domain=").append(cookie.domain);
        header.append("; Path=").append(cookie.path);
        if (!cookie.isSessionCookie()) {
            header.append("; Expires=").append(formatExpiry(cookie.expiresAtEpochSeconds));
        }
        if (cookie.secure) header.append("; Secure");
        if (cookie.httpOnly) header.append("; HttpOnly");
        return header.toString();
    }

    private static boolean hasValidPrefixSemantics(BrowserCookieImport.Cookie cookie) {
        if (cookie.name.startsWith("__Secure-") && !cookie.secure) return false;
        if (cookie.name.startsWith("__Host-")
                && (!cookie.secure || cookie.includeSubdomains || !"/".equals(cookie.path))) {
            return false;
        }
        return true;
    }

    private static String formatExpiry(long epochSeconds) {
        SimpleDateFormat format = new SimpleDateFormat(
                "EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("GMT"));
        return format.format(new Date(epochSeconds * 1000L));
    }

}
