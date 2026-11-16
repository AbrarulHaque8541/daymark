package com.abrar.daymark;

import java.net.IDN;
import java.net.URI;
import java.net.URLEncoder;
import java.io.UnsupportedEncodingException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Input parsing for explicit browser navigation; this class never performs network requests. */
final class BrowserAddress {
    private static final int MAX_INPUT_LENGTH = 2048;
    private static final Pattern SCHEME = Pattern.compile("^[A-Za-z][A-Za-z0-9+.-]*:");
    private static final Pattern BARE_DOMAIN = Pattern.compile(
            "(?i)^(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}(?::[0-9]{1,5})?(?:[/\\?#].*)?$");
    private static final Pattern BARE_IPV4_HOST = Pattern.compile("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$");
    private static final Pattern BARE_IPV6_AUTHORITY =
            Pattern.compile("^\\[[0-9A-Fa-f:.]+\\](?::[0-9]{1,5})?$");
    private static final Pattern BARE_LOCALHOST_AUTHORITY =
            Pattern.compile("(?i)^localhost(?::([0-9]{1,5}))?$");

    private BrowserAddress() { }

    enum SearchEngine {
        DUCKDUCKGO("DuckDuckGo", "https://duckduckgo.com/?q="),
        GOOGLE("Google", "https://www.google.com/search?q="),
        BING("Bing", "https://www.bing.com/search?q="),
        BRAVE("Brave Search", "https://search.brave.com/search?q="),
        STARTPAGE("Startpage", "https://www.startpage.com/sp/search?query="),
        YAHOO("Yahoo", "https://search.yahoo.com/search?p="),
        ECOSIA("Ecosia", "https://www.ecosia.org/search?q="),
        QWANT("Qwant", "https://www.qwant.com/?q="),
        MOJEEK("Mojeek", "https://www.mojeek.com/search?q="),
        KAGI("Kagi", "https://kagi.com/search?q="),
        YOU("You.com", "https://you.com/search?q="),
        YANDEX("Yandex", "https://yandex.com/search/?text="),
        BAIDU("Baidu", "https://www.baidu.com/s?wd="),
        DUCKDUCKGO_LITE("DuckDuckGo Lite", "https://lite.duckduckgo.com/lite/?q="),
        QWANT_AI("Qwant AI", "https://www.qwant.com/?q="),
        CHATGPT("ChatGPT", "https://chatgpt.com/?q="),
        PERPLEXITY("Perplexity", "https://www.perplexity.ai/search?q="),
        GEMINI("Google Gemini", "https://gemini.google.com/app?query="),
        CLAUDE("Claude", "https://claude.ai/new?q="),
        COPILOT("Microsoft Copilot", "https://copilot.microsoft.com/?q="),
        GROK("Grok", "https://grok.com/?q="),
        DEEPSEEK("DeepSeek", "https://chat.deepseek.com/?q="),
        PHIND("Phind", "https://www.phind.com/search?q="),
        KIMI("Kimi", "https://www.kimi.com/?q="),
        YOU_COM_AI("You.com AI", "https://you.com/search?q="),
        WOLFRAM_ALPHA("WolframAlpha", "https://www.wolframalpha.com/input/?i="),
        WIKIPEDIA("Wikipedia", "https://en.wikipedia.org/wiki/Special:Search?search="),
        ANDI("Andi Search", "https://andisearch.com/?query="),
        EXA("Exa Search", "https://exa.ai/search?q="),
        META_AI("Meta AI", "https://www.meta.ai/?q="),
        MISTRAL("Mistral Le Chat", "https://chat.mistral.ai/chat/?q="),
        POE("Poe", "https://poe.com/?q="),
        HUGGINGCHAT("HuggingChat", "https://huggingface.co/chat/?q="),
        DUCK_AI("Duck.ai", "https://duck.ai/?q="),
        QWEN_CHAT("Qwen Chat", "https://chat.qwen.ai/?q="),
        CHARACTER_AI("Character AI", "https://character.ai/?q=");

        final String label;
        private final String searchPrefix;

        SearchEngine(String label, String searchPrefix) {
            this.label = label;
            this.searchPrefix = searchPrefix;
        }

        String searchUrl(String query) {
            if (query == null || query.trim().isEmpty()) {
                throw new IllegalArgumentException("Type a search or web address first.");
            }
            try {
                return searchPrefix + URLEncoder.encode(query.trim(), "UTF-8");
            } catch (UnsupportedEncodingException impossible) {
                throw new IllegalStateException("UTF-8 is unavailable.", impossible);
            }
        }

        static SearchEngine fromName(String name) {
            if (name != null) {
                for (SearchEngine engine : values()) {
                    if (engine.name().equals(name)) return engine;
                }
            }
            return DUCKDUCKGO;
        }
    }

    static String resolveInput(String input, SearchEngine engine) {
        String value = input == null ? "" : input.trim();
        if (value.isEmpty()) throw new IllegalArgumentException("Type a search or web address first.");
        if (value.length() > MAX_INPUT_LENGTH) {
            throw new IllegalArgumentException("Web searches and addresses can be at most 2048 characters.");
        }
        if (looksLikeBareDomain(value)) return requireAllowedWebUrl(BrowserHttpPolicy.resolveBareDomain(value));
        if (SCHEME.matcher(value).find()) return requireAllowedBrowserNavigation(value);
        return (engine == null ? SearchEngine.DUCKDUCKGO : engine).searchUrl(value);
    }

    /**
     * Validates a user-requested browser navigation without weakening the stricter
     * HTTP(S)-only contract used by web-only features such as history and downloads.
     */
    static String requireAllowedBrowserNavigation(String value) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("A browser address is required.");
        }
        String candidate = value.trim();
        if (candidate.length() > MAX_INPUT_LENGTH + 8) {
            throw new IllegalArgumentException("This browser address is too long.");
        }
        java.util.regex.Matcher matcher = SCHEME.matcher(candidate);
        if (!matcher.find()) throw new IllegalArgumentException("Enter a valid browser address.");
        String scheme = candidate.substring(0, matcher.end() - 1);
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            return requireAllowedWebUrl(candidate);
        }
        for (int i = 0; i < candidate.length(); i++) {
            char ch = candidate.charAt(i);
            if (ch <= 0x1F || ch == 0x7F) {
                throw new IllegalArgumentException("Enter a valid browser address.");
            }
        }
        return candidate;
    }

    static String requireAllowedWebUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("A web address is required.");
        }
        String candidate = value.trim();
        if (candidate.length() > MAX_INPUT_LENGTH + 8) {
            throw new IllegalArgumentException("This web address is too long.");
        }
        try {
            URI uri = new URI(toAsciiHostUrl(candidate));
            String scheme = uri.getScheme();
            // HTTP and HTTPS are both allowed in the browser (BrowserHttpPolicy.ALLOW_HTTP).
            // HTTP pages are labelled "Not encrypted" in the UI via BrowserHttpPolicy.securityLabel().
            // Updater and other app network clients remain HTTPS-only (separate code path).
            if (!BrowserHttpPolicy.isAllowedWebScheme(candidate)) {
                if ("http".equalsIgnoreCase(scheme)) {
                    // unreachable when ALLOW_HTTP=true, but kept for policy-toggle safety
                    throw new IllegalArgumentException("HTTP is currently blocked. Use HTTPS.");
                }
                throw new IllegalArgumentException("Only HTTP and HTTPS pages are supported in the browser.");
            }
            if (uri.getRawUserInfo() != null) {
                throw new IllegalArgumentException("Enter a valid web address without embedded credentials.");
            }
            String host = uri.getHost();
            if (host == null || host.trim().isEmpty()) {
                throw new IllegalArgumentException("Enter a valid web address with a host name.");
            }
            String hostForIpValidation = host.endsWith(".")
                    ? host.substring(0, host.length() - 1) : host;
            if (!isCanonicalIpv4Literal(hostForIpValidation)
                    && endsInWhatwgIpv4Number(hostForIpValidation)) {
                throw new IllegalArgumentException(
                        "IP hosts must use canonical four-octet decimal IPv4 notation.");
            }
            if (host.startsWith("[") && !hasCanonicalIpv4Tail(host)) {
                throw new IllegalArgumentException(
                        "IPv4 tails in IPv6 addresses must use canonical octets.");
            }
            if (hasExplicitEmptyPort(uri)) {
                throw new IllegalArgumentException("Enter a valid port between 1 and 65535.");
            }
            int port = uri.getPort();
            if (port == 0 || port > 65535) {
                throw new IllegalArgumentException("Enter a valid port between 1 and 65535.");
            }
            return uri.normalize().toASCIIString();
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("Enter a valid web address.");
        }
    }

    static boolean shouldHandOffExternalScheme(boolean mainFrame, boolean userGesture, String scheme) {
        return mainFrame && userGesture && isExplicitExternalScheme(scheme);
    }

    static boolean isExplicitExternalScheme(String scheme) {
        if (scheme == null) return false;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        if (!Pattern.matches("^[a-z][a-z0-9+.-]*$", normalized)) return false;
        switch (normalized) {
            case "mailto": case "tel": case "sms": case "geo":
                return true;
            default: return false;
        }
    }

    static boolean isLikelyWebAddress(String value) {
        if (value == null) return false;
        String candidate = value.trim();
        return SCHEME.matcher(candidate).find() || looksLikeBareDomain(candidate);
    }

    static boolean isAllowedWebUrl(String value) {
        try {
            requireAllowedWebUrl(value);
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static boolean looksLikeBareDomain(String value) {
        if (value.indexOf('@') >= 0 || value.chars().anyMatch(Character::isWhitespace)) return false;
        int delimiter = firstOf(value, '/', '?', '#');
        String hostPart = delimiter < 0 ? value : value.substring(0, delimiter);
        if (!isAscii(hostPart)) {
            int colon = hostPart.lastIndexOf(':');
            String bareHost = colon < 0 ? hostPart : hostPart.substring(0, colon);
            String asciiHost = idnToAscii(bareHost);
            if (asciiHost == null) return false;
            hostPart = asciiHost + (colon < 0 ? "" : hostPart.substring(colon));
        }
        return isBareIpv4Authority(hostPart)
                || isBareIpv6Authority(hostPart)
                || isBareLocalhostAuthority(hostPart)
                || (BARE_DOMAIN.matcher(hostPart).matches()
                && hostPart.toLowerCase(Locale.ROOT).contains("."));
    }

    private static boolean isBareIpv4Authority(String authority) {
        int colon = authority.lastIndexOf(':');
        String host = colon < 0 ? authority : authority.substring(0, colon);
        if (!BARE_IPV4_HOST.matcher(host).matches()) return false;
        if (colon >= 0 && !isValidPortText(authority.substring(colon + 1))) return false;
        return isCanonicalIpv4Literal(host);
    }

    private static boolean isBareIpv6Authority(String authority) {
        if (!BARE_IPV6_AUTHORITY.matcher(authority).matches()) return false;
        try {
            URI uri = new URI("https://" + authority);
            int port = uri.getPort();
            String host = uri.getHost();
            return host != null && host.startsWith("[") && hasCanonicalIpv4Tail(host)
                    && !hasExplicitEmptyPort(uri) && port != 0 && port <= 65535;
        } catch (Exception invalid) {
            return false;
        }
    }

    private static boolean isCanonicalIpv4Literal(String host) {
        if (host == null || !BARE_IPV4_HOST.matcher(host).matches()) return false;
        String[] octets = host.split("\\.", -1);
        for (String octet : octets) {
            if (octet.length() > 1 && octet.charAt(0) == '0') return false;
            if (Integer.parseInt(octet) > 255) return false;
        }
        return true;
    }

    /**
     * Mirrors WHATWG's ends-in-a-number check so Chromium cannot reinterpret a
     * non-canonical DNS-looking host as a shortened, octal, hexadecimal, or
     * integer IPv4 address after this validator has accepted it.
     */
    private static boolean endsInWhatwgIpv4Number(String host) {
        if (host == null || host.isEmpty()) return false;
        String[] labels = host.split("\\.", -1);
        String last = labels[labels.length - 1];
        return last.matches("[0-9]+")
                || last.matches("(?i)0x[0-9a-f]*")
                || (last.length() > 1 && last.charAt(0) == '0'
                && last.substring(1).matches("[0-7]+"));
    }

    private static boolean hasCanonicalIpv4Tail(String bracketedHost) {
        if (bracketedHost == null || !bracketedHost.startsWith("[")
                || !bracketedHost.endsWith("]")) return false;
        String literal = bracketedHost.substring(1, bracketedHost.length() - 1);
        int lastColon = literal.lastIndexOf(':');
        if (lastColon < 0) return true;
        String tail = literal.substring(lastColon + 1);
        return !tail.contains(".") || isCanonicalIpv4Literal(tail);
    }

    private static boolean isBareLocalhostAuthority(String authority) {
        java.util.regex.Matcher matcher = BARE_LOCALHOST_AUTHORITY.matcher(authority);
        if (!matcher.matches()) return false;
        String port = matcher.group(1);
        return port == null || isValidPortText(port);
    }

    private static boolean isValidPortText(String text) {
        if (text == null || !text.matches("[0-9]{1,5}")) return false;
        int port = Integer.parseInt(text);
        return port >= 1 && port <= 65535;
    }

    /** Reject an explicit trailing port separator; URI.getPort() reports -1 for it. */
    private static boolean hasExplicitEmptyPort(URI uri) {
        String authority = uri.getRawAuthority();
        if (authority == null) return false;
        int userInfoEnd = authority.lastIndexOf('@');
        if (userInfoEnd >= 0) authority = authority.substring(userInfoEnd + 1);
        if (authority.startsWith("[")) {
            int closingBracket = authority.indexOf(']');
            return closingBracket >= 0 && closingBracket + 1 < authority.length()
                    && authority.charAt(closingBracket + 1) == ':'
                    && closingBracket + 2 == authority.length();
        }
        int colon = authority.lastIndexOf(':');
        return colon >= 0 && colon == authority.length() - 1;
    }

    private static String toAsciiHostUrl(String candidate) {
        int schemeEnd = candidate.indexOf("://");
        if (schemeEnd < 0) return candidate;
        int authorityStart = schemeEnd + 3;
        int authorityEnd = candidate.length();
        for (int i = authorityStart; i < candidate.length(); i++) {
            char ch = candidate.charAt(i);
            if (ch == '/' || ch == '?' || ch == '#') {
                authorityEnd = i;
                break;
            }
        }
        String authority = candidate.substring(authorityStart, authorityEnd);
        if (authority.isEmpty() || authority.startsWith("[")) return candidate;
        String userInfo = "";
        String hostAndPort = authority;
        int at = authority.lastIndexOf('@');
        if (at >= 0) {
            userInfo = authority.substring(0, at + 1);
            hostAndPort = authority.substring(at + 1);
        }
        int colon = hostAndPort.lastIndexOf(':');
        String host = colon < 0 ? hostAndPort : hostAndPort.substring(0, colon);
        if (isAscii(host)) return candidate;
        String asciiHost = idnToAscii(host);
        if (asciiHost == null || asciiHost.isEmpty()) {
            throw new IllegalArgumentException("Enter a valid web address.");
        }
        String portPart = colon < 0 ? "" : hostAndPort.substring(colon);
        return candidate.substring(0, authorityStart) + userInfo + asciiHost + portPart
                + candidate.substring(authorityEnd);
    }

    private static String idnToAscii(String host) {
        try {
            String ascii = IDN.toASCII(host, IDN.ALLOW_UNASSIGNED);
            return ascii == null || ascii.isEmpty() ? null : ascii;
        } catch (IllegalArgumentException invalid) {
            return null;
        }
    }

    private static boolean isAscii(String value) {
        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) > 0x7F) return false;
        }
        return true;
    }

    private static int firstOf(String value, char... chars) {
        int first = -1;
        for (char ch : chars) {
            int index = value.indexOf(ch);
            if (index >= 0 && (first < 0 || index < first)) first = index;
        }
        return first;
    }
}
