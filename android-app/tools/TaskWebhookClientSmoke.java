package com.abrar.daymark;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLPeerUnverifiedException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.security.cert.Certificate;
import java.util.Collections;
import java.util.Map;

/** Host-side tests for webhook payload privacy, HTTPS validation and transport behavior. */
public final class TaskWebhookClientSmoke {
    public static void main(String[] args) throws Exception {
        Task task = new Task("secret-internal-id", "Send update", "2026-10-31", "high", false,
                "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z",
                Collections.emptyList(), "Line one\nQuote: \"hello\"\\", "10:15",
                null, null, null, Collections.emptyList());
        String withoutNotes = TaskWebhookPayload.create(task, false);
        Map<String, Object> payload = StrictJsonParser.object(
                StrictJsonParser.parse(withoutNotes), "webhook payload");
        check("daymark.task.shared".equals(payload.get("event")), "event type is explicit");
        Map<String, Object> taskObject = StrictJsonParser.object(payload.get("task"), "task payload");
        check("Send update".equals(taskObject.get("title")), "task title is present");
        check(!taskObject.containsKey("notes"), "notes are omitted unless explicitly opted in");
        check(!withoutNotes.contains("secret-internal-id"), "internal task identifiers are never exported");

        String withNotes = TaskWebhookPayload.create(task, true);
        Map<String, Object> notesPayload = StrictJsonParser.object(
                StrictJsonParser.parse(withNotes), "webhook payload");
        Map<String, Object> notesTask = StrictJsonParser.object(notesPayload.get("task"), "task payload");
        check("Line one\nQuote: \"hello\"\\".equals(notesTask.get("notes")),
                "notes are escaped and round-trip as JSON");
        expectIllegal(() -> TaskWebhookPayload.create(null, false), "null task is rejected");

        URL accepted = TaskWebhookClient.validateEndpoint("https://hooks.example.test/path?token=secret");
        check("https".equals(accepted.getProtocol()), "HTTPS endpoint is accepted");
        expectIllegal(() -> TaskWebhookClient.validateEndpoint("http://hooks.example.test/path"),
                "plain HTTP is rejected");
        expectIllegal(() -> TaskWebhookClient.validateEndpoint("https://user:pass@hooks.example.test/path"),
                "embedded URL credentials are rejected");
        expectIllegal(() -> TaskWebhookClient.validateEndpoint("https://hooks.example.test/path#fragment"),
                "URL fragments are rejected");
        expectIllegal(() -> TaskWebhookClient.validateEndpoint("https://hooks.example.test:0/path"),
                "invalid ports are rejected");
        expectIllegal(() -> TaskWebhookClient.validateEndpoint("not a URL"),
                "malformed endpoint is rejected");

        FakeHttpsConnection success = new FakeHttpsConnection(new URL("https://hooks.example.test/path"),
                204, new byte[0]);
        int status = new TaskWebhookClient(ignored -> success)
                .sendTask("https://hooks.example.test/path", task, false);
        check(status == 204, "successful webhook status is returned");
        check("POST".equals(success.getRequestMethod()), "webhook uses POST");
        check(!success.getInstanceFollowRedirects(), "webhook redirects are disabled");
        check(success.getDoOutput(), "webhook request has a body");
        check(!success.getUseCaches(), "webhook response caching is disabled");
        check("application/json; charset=utf-8".equals(success.getRequestProperty("Content-Type")),
                "webhook content type is JSON UTF-8");
        check(success.getRequestProperty("Authorization") == null,
                "connector does not invent or persist authorization credentials");
        Map<String, Object> sent = StrictJsonParser.object(
                StrictJsonParser.parse(success.requestBody.toString(StandardCharsets.UTF_8.name())),
                "sent webhook payload");
        check("daymark.task.shared".equals(sent.get("event")), "serialized request body is valid");
        check(success.disconnected, "connection is disconnected after success");

        expectStatus(302, TaskWebhookClient.Failure.HTTP, "redirect response is not followed");
        expectStatus(503, TaskWebhookClient.Failure.HTTP, "server errors are surfaced");
        FakeHttpsConnection oversized = new FakeHttpsConnection(new URL("https://hooks.example.test/path"),
                200, new byte[64 * 1024 + 1]);
        try {
            new TaskWebhookClient(ignored -> oversized)
                    .sendTask("https://hooks.example.test/path", task, false);
            throw new AssertionError("oversized response must fail closed");
        } catch (TaskWebhookClient.WebhookException expected) {
            check(expected.failure == TaskWebhookClient.Failure.INVALID_RESPONSE,
                    "oversized response is classified as invalid");
        }
        FakeHttpsConnection invalidUtf8 = new FakeHttpsConnection(new URL("https://hooks.example.test/path"),
                200, new byte[] { (byte) 0xC3, 0x28 });
        try {
            new TaskWebhookClient(ignored -> invalidUtf8)
                    .sendTask("https://hooks.example.test/path", task, false);
            throw new AssertionError("invalid UTF-8 response must fail closed");
        } catch (TaskWebhookClient.WebhookException expected) {
            check(expected.failure == TaskWebhookClient.Failure.INVALID_RESPONSE,
                    "invalid UTF-8 is classified as invalid");
        }

        System.out.println("PASS HTTPS task webhook client");
    }

    private static void expectStatus(int status, TaskWebhookClient.Failure expected, String message)
            throws Exception {
        FakeHttpsConnection connection = new FakeHttpsConnection(
                new URL("https://hooks.example.test/path"), status, new byte[0]);
        try {
            new TaskWebhookClient(ignored -> connection)
                    .sendTask("https://hooks.example.test/path",
                            new Task("id", "title", null, "low", false, "a", "b"), false);
            throw new AssertionError(message);
        } catch (TaskWebhookClient.WebhookException failure) {
            check(failure.failure == expected, message);
        }
    }

    private static void expectIllegal(Runnable operation, String message) {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected.
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static final class FakeHttpsConnection extends HttpsURLConnection {
        final int status;
        final byte[] response;
        final ByteArrayOutputStream requestBody = new ByteArrayOutputStream();
        boolean disconnected;

        FakeHttpsConnection(URL url, int status, byte[] response) {
            super(url);
            this.status = status;
            this.response = response;
        }

        @Override public void disconnect() { disconnected = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { }
        @Override public int getResponseCode() { return status; }
        @Override public OutputStream getOutputStream() { return requestBody; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(response); }
        @Override public String getCipherSuite() { return "TLS_FAKE"; }
        @Override public Certificate[] getLocalCertificates() { return null; }
        @Override public Certificate[] getServerCertificates() throws SSLPeerUnverifiedException {
            return new Certificate[0];
        }
        @Override public Principal getPeerPrincipal() throws SSLPeerUnverifiedException { return null; }
        @Override public Principal getLocalPrincipal() { return null; }
    }
}
