package com.abrar.daymark;

import javax.net.ssl.HttpsURLConnection;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * App-owned browser download transport. It accepts HTTPS only, handles redirects itself,
 * and never delegates redirect policy to the platform DownloadManager.
 *
 * <p>The caller owns {@code destination}; a failed transfer can leave partial bytes in it,
 * so callers must write to a disposable staging destination and discard it on failure.
 * Call off the UI thread. This class does not log URLs or request headers.
 */
final class BrowserHttpsDownloader {
    static final int MAX_REDIRECTS = 5;
    private static final int CONNECT_TIMEOUT_MILLIS = 15_000;
    private static final int READ_TIMEOUT_MILLIS = 30_000;
    private static final Pattern HEADER_NAME = Pattern.compile("[!#$%&'*+.^_`|~0-9A-Za-z-]+");
    private static final Set<String> MANAGED_HEADERS = new HashSet<>(Arrays.asList(
            "connection", "content-length", "host", "keep-alive", "proxy-connection",
            "te", "trailer", "transfer-encoding", "upgrade"));

    enum Failure { INVALID_REQUEST, INVALID_URL, OFFLINE, REDIRECT, HTTP, IO }

    static final class DownloadException extends Exception {
        final Failure failure;

        DownloadException(Failure failure, String message) {
            super(message);
            this.failure = failure;
        }

        DownloadException(Failure failure, String message, Throwable cause) {
            super(message, cause);
            this.failure = failure;
        }
    }

    interface ConnectionFactory {
        HttpsURLConnection open(URL url) throws IOException;
    }

    interface OnlineGate {
        boolean allowsRemoteLoads();
    }

    private final ConnectionFactory connections;

    BrowserHttpsDownloader() {
        this(url -> (HttpsURLConnection) url.openConnection());
    }

    BrowserHttpsDownloader(ConnectionFactory connections) {
        if (connections == null) throw new IllegalArgumentException("Connection factory is required.");
        this.connections = connections;
    }

    long download(String sourceUrl, Map<String, String> requestHeaders,
                  OutputStream destination, OnlineGate onlineGate) throws DownloadException {
        if (destination == null || onlineGate == null) {
            throw new DownloadException(Failure.INVALID_REQUEST,
                    "A destination and Online policy are required for this download.");
        }
        URL current = validateHttpsUrl(sourceUrl);
        LinkedHashMap<String, String> headers = copyAndValidateHeaders(requestHeaders);
        requireOnline(onlineGate);

        int redirects = 0;
        HttpsURLConnection connection = null;
        try {
            while (true) {
                requireOnline(onlineGate);
                connection = connections.open(current);
                if (connection == null) throw new IOException("No HTTPS connection was created.");
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
                connection.setReadTimeout(READ_TIMEOUT_MILLIS);
                connection.setUseCaches(false);
                connection.setAllowUserInteraction(false);
                for (Map.Entry<String, String> header : headers.entrySet()) {
                    connection.setRequestProperty(header.getKey(), header.getValue());
                }

                int status = connection.getResponseCode();
                if (isRedirect(status)) {
                    String location = connection.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty() || redirects >= MAX_REDIRECTS) {
                        throw new DownloadException(Failure.REDIRECT,
                                "The HTTPS download redirect was missing or exceeded the five-hop limit.");
                    }
                    URL next = resolveRedirect(current, location);
                    if (!sameOrigin(current, next)) stripAllCallerHeaders(headers);
                    redirects++;
                    connection.disconnect();
                    connection = null;
                    current = next;
                    continue;
                }
                if (status < 200 || status >= 300) {
                    throw new DownloadException(Failure.HTTP,
                            "The HTTPS download returned HTTP " + status + ".");
                }

                long copied = 0L;
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[16 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        requireOnline(onlineGate);
                        if (Long.MAX_VALUE - copied < count) {
                            throw new DownloadException(Failure.IO,
                                    "The HTTPS download exceeded the supported byte count.");
                        }
                        destination.write(buffer, 0, count);
                        copied += count;
                    }
                }
                destination.flush();
                return copied;
            }
        } catch (DownloadException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw new DownloadException(Failure.IO,
                    "The HTTPS download did not complete.", exception);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static URL validateHttpsUrl(String value) throws DownloadException {
        if (value == null || value.trim().isEmpty()) {
            throw new DownloadException(Failure.INVALID_URL, "An HTTPS download URL is required.");
        }
        try {
            URI uri = new URI(value.trim());
            int port = uri.getPort();
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null || uri.getHost().trim().isEmpty()
                    || uri.getRawUserInfo() != null || port == 0 || port > 65535
                    || hasExplicitEmptyPort(uri)) {
                throw new DownloadException(Failure.INVALID_URL,
                        "Browser downloads require a valid HTTPS URL without embedded credentials.");
            }
            return uri.normalize().toURL();
        } catch (DownloadException exception) {
            throw exception;
        } catch (URISyntaxException | IOException | IllegalArgumentException exception) {
            throw new DownloadException(Failure.INVALID_URL,
                    "The HTTPS download URL is invalid.", exception);
        }
    }

    private static URL resolveRedirect(URL current, String location) throws DownloadException {
        try {
            URL resolved = new URL(current, location.trim());
            return validateHttpsUrl(resolved.toExternalForm());
        } catch (DownloadException exception) {
            throw new DownloadException(Failure.REDIRECT,
                    "The HTTPS download redirect target was invalid or not HTTPS.", exception);
        } catch (IOException | IllegalArgumentException exception) {
            throw new DownloadException(Failure.REDIRECT,
                    "The HTTPS download redirect target was invalid.", exception);
        }
    }

    private static LinkedHashMap<String, String> copyAndValidateHeaders(Map<String, String> input)
            throws DownloadException {
        LinkedHashMap<String, String> result = new LinkedHashMap<>();
        if (input == null) return result;
        for (Map.Entry<String, String> entry : input.entrySet()) {
            String name = entry.getKey();
            String value = entry.getValue();
            if (name == null || !HEADER_NAME.matcher(name).matches() || value == null
                    || containsHeaderControl(value)) {
                throw new DownloadException(Failure.INVALID_REQUEST,
                        "The download contains an invalid request header.");
            }
            String lower = name.toLowerCase(Locale.ROOT);
            if (MANAGED_HEADERS.contains(lower)) {
                throw new DownloadException(Failure.INVALID_REQUEST,
                        "A managed transport header cannot be supplied by the caller.");
            }
            result.put(name, value);
        }
        return result;
    }

    private static boolean containsHeaderControl(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '\r' || character == '\n'
                    || (character < 0x20 && character != '\t') || character == 0x7f) {
                return true;
            }
        }
        return false;
    }

    private static void stripAllCallerHeaders(Map<String, String> headers) {
        headers.clear();
    }

    private static boolean sameOrigin(URL first, URL second) {
        return origin(first).equals(origin(second));
    }

    private static String origin(URL url) {
        int port = url.getPort() < 0 ? 443 : url.getPort();
        return url.getHost().toLowerCase(Locale.ROOT) + ":" + port;
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    private static boolean hasExplicitEmptyPort(URI uri) {
        String authority = uri.getRawAuthority();
        if (authority == null || authority.isEmpty()) return false;
        int userInfoEnd = authority.lastIndexOf('@');
        if (userInfoEnd >= 0) authority = authority.substring(userInfoEnd + 1);
        if (authority.isEmpty()) return false;
        if (authority.charAt(0) == '[') {
            int closingBracket = authority.indexOf(']');
            return closingBracket >= 0 && closingBracket + 1 < authority.length()
                    && authority.charAt(closingBracket + 1) == ':'
                    && closingBracket + 2 == authority.length();
        }
        return authority.charAt(authority.length() - 1) == ':';
    }

    private static void requireOnline(OnlineGate onlineGate) throws DownloadException {
        if (!onlineGate.allowsRemoteLoads()) {
            throw new DownloadException(Failure.OFFLINE,
                    "The browser is Offline. The HTTPS download was stopped.");
        }
    }
}
