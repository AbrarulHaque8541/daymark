package com.abrar.daymark;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLPeerUnverifiedException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.security.cert.Certificate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** Host-side transport tests for the app-owned browser downloader. */
public final class BrowserHttpsDownloaderSmoke {
    private static int assertions;

    private BrowserHttpsDownloaderSmoke() { }

    public static void main(String[] args) throws Exception {
        downloadsOnlyOverValidatedHttps();
        followsRelativeRedirectsWithoutPlatformAutomation();
        stripsCredentialsAfterCrossingOrigins();
        rejectsUnsafeRedirectTargets();
        capsRedirectsAtFiveHops();
        honorsOnlineAndOfflineTransitions();
        rejectsUnsafeCallerHeaders();
        System.out.println("PASS browser HTTPS downloader: " + assertions + " assertions");
    }

    private static void downloadsOnlyOverValidatedHttps() throws Exception {
        FakeHttpsConnection response = response("https://files.example.test/file", 200, null,
                "file bytes".getBytes(StandardCharsets.UTF_8));
        QueueFactory factory = new QueueFactory(response);
        ByteArrayOutputStream destination = new ByteArrayOutputStream();
        Map<String, String> headers = Map.of(
                "User-Agent", "Daymark-Test/1",
                "Cookie", "session=private",
                "Authorization", "Bearer private");
        long count = new BrowserHttpsDownloader(factory).download(
                "https://files.example.test/file", headers, destination, () -> true);
        check(count == 10L && "file bytes".equals(destination.toString(StandardCharsets.UTF_8.name())),
                "HTTPS response bytes stream to the caller-owned destination");
        check("GET".equals(response.getRequestMethod()), "browser download uses GET");
        check(!response.getInstanceFollowRedirects(), "platform automatic redirects are disabled");
        check(!response.getUseCaches(), "download responses are not taken from a stale URL cache");
        check("Daymark-Test/1".equals(response.header("user-agent")), "ordinary request headers are retained");
        check("session=private".equals(response.header("cookie")), "initial-origin cookie may be sent");
        check("Bearer private".equals(response.header("authorization")), "initial-origin authorization may be sent");
        check(response.disconnected, "final connection is disconnected");

        for (String invalid : new String[] {
                "http://files.example.test/file",
                "ftp://files.example.test/file",
                "https://user:pass@files.example.test/file",
                "https://files.example.test:/file",
                "https://files.example.test:0/file",
                "https://files.example.test:65536/file"
        }) {
            QueueFactory unused = new QueueFactory();
            expectFailure(BrowserHttpsDownloader.Failure.INVALID_URL,
                    () -> new BrowserHttpsDownloader(unused).download(
                            invalid, Map.of(), new ByteArrayOutputStream(), () -> true),
                    "unsafe start URL is rejected: " + invalid);
            check(unused.opened.isEmpty(), "invalid URL is rejected before network access");
        }
    }

    private static void followsRelativeRedirectsWithoutPlatformAutomation() throws Exception {
        FakeHttpsConnection first = response("https://files.example.test/start", 302,
                "../final?download=1", new byte[0]);
        FakeHttpsConnection last = response("https://files.example.test/final?download=1", 200,
                null, new byte[] { 7, 8, 9 });
        QueueFactory factory = new QueueFactory(first, last);
        ByteArrayOutputStream destination = new ByteArrayOutputStream();
        long count = new BrowserHttpsDownloader(factory).download(
                "https://files.example.test/dir/start", Map.of("Cookie", "session=same-origin"),
                destination, () -> true);
        check(count == 3L && Arrays.equals(destination.toByteArray(), new byte[] { 7, 8, 9 }),
                "relative Location is resolved and final body is returned");
        check(factory.opened.size() == 2, "redirect is opened as a second, separately validated request");
        check("https://files.example.test/final?download=1".equals(
                        factory.opened.get(1).requestedUrl.toExternalForm()),
                "relative redirect path and query resolve against the current URL");
        check("session=same-origin".equals(last.header("cookie")),
                "cookies are retained for a same-origin redirect");
        check(!first.getInstanceFollowRedirects() && !last.getInstanceFollowRedirects(),
                "automatic redirects remain disabled on every hop");
    }

    private static void stripsCredentialsAfterCrossingOrigins() throws Exception {
        FakeHttpsConnection first = response("https://start.example.test/file", 302,
                "https://cdn.example.test/file", new byte[0]);
        FakeHttpsConnection crossOrigin = response("https://cdn.example.test/file", 302,
                "https://start.example.test/return", new byte[0]);
        FakeHttpsConnection returned = response("https://start.example.test/return", 200,
                null, new byte[] { 1 });
        QueueFactory factory = new QueueFactory(first, crossOrigin, returned);
        new BrowserHttpsDownloader(factory).download("https://start.example.test/file",
                Map.of("Cookie", "session=secret", "Authorization", "Bearer secret",
                        "Proxy-Authorization", "proxy-secret", "Cookie2", "legacy=secret",
                        "X-Api-Key", "custom-secret", "X-Auth-Token", "token-secret",
                        "User-Agent", "Daymark-Test/1"),
                new ByteArrayOutputStream(), () -> true);

        check("session=secret".equals(first.header("cookie")), "credentials are available on the original origin");
        check("Daymark-Test/1".equals(first.header("user-agent")),
                "caller headers are available on the original origin");
        check("custom-secret".equals(first.header("x-api-key")),
                "custom credential header is available on the original origin");
        check("token-secret".equals(first.header("x-auth-token")),
                "custom auth-token header is available on the original origin");
        check(crossOrigin.header("cookie") == null && crossOrigin.header("authorization") == null
                        && crossOrigin.header("proxy-authorization") == null
                        && crossOrigin.header("cookie2") == null,
                "all cookie and authorization headers are stripped on a cross-origin hop");
        check(crossOrigin.header("x-api-key") == null,
                "custom credential header is absent on the CDN hop");
        check(crossOrigin.header("x-auth-token") == null,
                "custom auth-token header is absent on the CDN hop");
        check(returned.header("cookie") == null && returned.header("authorization") == null,
                "credentials remain stripped if a later redirect returns to the first origin");
        check(returned.header("x-api-key") == null,
                "custom credential header remains absent after returning to the original origin");
        check(returned.header("x-auth-token") == null,
                "custom auth-token header remains absent after returning to the original origin");
        check(crossOrigin.header("user-agent") == null && returned.header("user-agent") == null,
                "all caller headers remain stripped after crossing and returning to the original origin");
    }

    private static void rejectsUnsafeRedirectTargets() throws Exception {
        for (String target : new String[] {
                "http://insecure.example.test/file",
                "https://user:pass@other.example.test/file",
                "https://other.example.test:/file",
                "https://other.example.test:0/file"
        }) {
            FakeHttpsConnection first = response("https://start.example.test/file", 302, target, new byte[0]);
            QueueFactory factory = new QueueFactory(first);
            expectFailure(BrowserHttpsDownloader.Failure.REDIRECT,
                    () -> new BrowserHttpsDownloader(factory).download("https://start.example.test/file",
                            Map.of(), new ByteArrayOutputStream(), () -> true),
                    "unsafe redirect target is rejected: " + target);
            check(factory.opened.size() == 1, "unsafe target is never opened");
            check(first.disconnected, "rejected redirect connection is closed");
        }

        FakeHttpsConnection noLocation = response("https://start.example.test/file", 302, null, new byte[0]);
        expectFailure(BrowserHttpsDownloader.Failure.REDIRECT,
                () -> new BrowserHttpsDownloader(new QueueFactory(noLocation)).download(
                        "https://start.example.test/file", Map.of(), new ByteArrayOutputStream(), () -> true),
                "redirect without Location fails closed");
    }

    private static void capsRedirectsAtFiveHops() throws Exception {
        Deque<FakeHttpsConnection> allowed = new ArrayDeque<>();
        for (int hop = 1; hop <= BrowserHttpsDownloader.MAX_REDIRECTS; hop++) {
            allowed.add(response("https://files.example.test/start", 302,
                    "/hop" + hop, new byte[0]));
        }
        allowed.add(response("https://files.example.test/hop5", 200, null, new byte[] { 3 }));
        QueueFactory allowedFactory = new QueueFactory(allowed);
        new BrowserHttpsDownloader(allowedFactory).download("https://files.example.test/start",
                Map.of(), new ByteArrayOutputStream(), () -> true);
        check(allowedFactory.opened.size() == 6, "exactly five redirect hops may precede the final response");

        Deque<FakeHttpsConnection> tooMany = new ArrayDeque<>();
        for (int hop = 1; hop <= BrowserHttpsDownloader.MAX_REDIRECTS + 2; hop++) {
            tooMany.add(response("https://files.example.test/start", 302,
                    "/hop" + hop, new byte[0]));
        }
        QueueFactory tooManyFactory = new QueueFactory(tooMany);
        expectFailure(BrowserHttpsDownloader.Failure.REDIRECT,
                () -> new BrowserHttpsDownloader(tooManyFactory).download("https://files.example.test/start",
                        Map.of(), new ByteArrayOutputStream(), () -> true),
                "a sixth redirect is rejected before following it");
        check(tooManyFactory.opened.size() == 6,
                "the redirect cap prevents opening a seventh request");
        check(tooManyFactory.remaining.size() == 1, "the sixth Location is not followed");
    }

    private static void honorsOnlineAndOfflineTransitions() throws Exception {
        QueueFactory offlineFactory = new QueueFactory();
        expectFailure(BrowserHttpsDownloader.Failure.OFFLINE,
                () -> new BrowserHttpsDownloader(offlineFactory).download("https://files.example.test/file",
                        Map.of(), new ByteArrayOutputStream(), () -> false),
                "Offline mode blocks a download before connecting");
        check(offlineFactory.opened.isEmpty(), "Offline start makes no network request");

        FakeHttpsConnection redirect = response("https://files.example.test/start", 302,
                "/next", new byte[0]);
        QueueFactory redirectFactory = new QueueFactory(redirect,
                response("https://files.example.test/next", 200, null, new byte[] { 1 }));
        AtomicInteger onlineChecks = new AtomicInteger();
        expectFailure(BrowserHttpsDownloader.Failure.OFFLINE,
                () -> new BrowserHttpsDownloader(redirectFactory).download("https://files.example.test/start",
                        Map.of(), new ByteArrayOutputStream(), () -> onlineChecks.incrementAndGet() < 3),
                "switching Offline prevents following a redirect");
        check(redirectFactory.opened.size() == 1 && redirect.disconnected,
                "Offline transition closes the current response and prevents the next hop");

        AtomicBoolean online = new AtomicBoolean(true);
        InputStream goesOfflineAfterRead = new InputStream() {
            private boolean sent;
            @Override public int read() { return -1; }
            @Override public int read(byte[] bytes, int offset, int length) {
                if (sent) return -1;
                sent = true;
                bytes[offset] = 4;
                online.set(false);
                return 1;
            }
        };
        FakeHttpsConnection body = response("https://files.example.test/file", 200, null, goesOfflineAfterRead);
        ByteArrayOutputStream partial = new ByteArrayOutputStream();
        expectFailure(BrowserHttpsDownloader.Failure.OFFLINE,
                () -> new BrowserHttpsDownloader(new QueueFactory(body)).download(
                        "https://files.example.test/file", Map.of(), partial, online::get),
                "switching Offline during response streaming stops the transfer");
        check(partial.size() == 0,
                "bytes read after Offline takes effect are not committed to the staging destination");
        check(body.disconnected, "mid-transfer Offline transition disconnects the active connection");
    }

    private static void rejectsUnsafeCallerHeaders() throws Exception {
        for (Map<String, String> headers : Arrays.asList(
                Map.of("Cookie", "ok\r\nAuthorization: injected"),
                Map.of("Host", "attacker.example"),
                Map.of("Content-Length", "0"))) {
            QueueFactory factory = new QueueFactory(response("https://files.example.test/file",
                    200, null, new byte[0]));
            expectFailure(BrowserHttpsDownloader.Failure.INVALID_REQUEST,
                    () -> new BrowserHttpsDownloader(factory).download("https://files.example.test/file",
                            headers, new ByteArrayOutputStream(), () -> true),
                    "unsafe caller header is rejected");
            check(factory.opened.isEmpty(), "invalid headers are rejected before network access");
        }
    }

    private static FakeHttpsConnection response(String url, int status, String location, byte[] body)
            throws Exception {
        return response(url, status, location, new ByteArrayInputStream(body));
    }

    private static FakeHttpsConnection response(String url, int status, String location, InputStream body)
            throws Exception {
        return new FakeHttpsConnection(new URL(url), status, location, body);
    }

    private static void expectFailure(BrowserHttpsDownloader.Failure expected,
                                      ThrowingOperation operation, String message) throws Exception {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (BrowserHttpsDownloader.DownloadException failure) {
            check(failure.failure == expected, message + " (failure=" + failure.failure + ")");
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        assertions++;
    }

    private interface ThrowingOperation {
        void run() throws Exception;
    }

    private static final class QueueFactory implements BrowserHttpsDownloader.ConnectionFactory {
        private final Deque<FakeHttpsConnection> remaining = new ArrayDeque<>();
        final List<FakeHttpsConnection> opened = new ArrayList<>();

        QueueFactory(FakeHttpsConnection... responses) {
            remaining.addAll(Arrays.asList(responses));
        }

        QueueFactory(Deque<FakeHttpsConnection> responses) {
            remaining.addAll(responses);
        }

        @Override public HttpsURLConnection open(URL url) throws IOException {
            if (!"https".equalsIgnoreCase(url.getProtocol())) {
                throw new IOException("non-HTTPS request reached the connection factory");
            }
            FakeHttpsConnection connection = remaining.pollFirst();
            if (connection == null) throw new IOException("unexpected extra HTTPS request: " + url);
            connection.requestedUrl = url;
            opened.add(connection);
            return connection;
        }
    }

    private static final class FakeHttpsConnection extends HttpsURLConnection {
        private final int status;
        private final String location;
        private final InputStream body;
        private final Map<String, String> requests = new HashMap<>();
        private boolean disconnected;
        private URL requestedUrl;

        FakeHttpsConnection(URL url, int status, String location, InputStream body) {
            super(url);
            this.status = status;
            this.location = location;
            this.body = body;
        }

        String header(String name) {
            return requests.get(name.toLowerCase(java.util.Locale.ROOT));
        }

        @Override public void disconnect() { disconnected = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { }
        @Override public int getResponseCode() { return status; }
        @Override public String getHeaderField(String name) {
            return "Location".equalsIgnoreCase(name) ? location : null;
        }
        @Override public InputStream getInputStream() { return body; }
        @Override public void setRequestProperty(String key, String value) {
            requests.put(key.toLowerCase(java.util.Locale.ROOT), value);
        }
        @Override public String getRequestProperty(String key) {
            return key == null ? null : requests.get(key.toLowerCase(java.util.Locale.ROOT));
        }
        @Override public String getCipherSuite() { return "TLS_FAKE"; }
        @Override public Certificate[] getLocalCertificates() { return null; }
        @Override public Certificate[] getServerCertificates() throws SSLPeerUnverifiedException {
            return new Certificate[0];
        }
        @Override public Principal getPeerPrincipal() throws SSLPeerUnverifiedException { return null; }
        @Override public Principal getLocalPrincipal() { return null; }
    }
}
