package com.abrar.daymark;
import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/**
 * Sends one explicitly approved task event to a user-configured HTTPS webhook.
 *
 * <p>Call off the UI thread. The endpoint may itself contain a provider-issued secret; never log,
 * display in diagnostics, or persist it without a protected credential store. Redirects are not
 * followed, and this client performs no retries.
 */
final class TaskWebhookClient {
    private static final int CONNECT_TIMEOUT_MILLIS = 10_000;
    private static final int READ_TIMEOUT_MILLIS = 15_000;
    private static final int MAX_RESPONSE_BYTES = 64 * 1024;

    enum Failure { INVALID_ENDPOINT, OFFLINE, HTTP, INVALID_RESPONSE }

    static final class WebhookException extends Exception {
        final Failure failure;

        WebhookException(Failure failure, String message) {
            super(message);
            this.failure = failure;
        }

        WebhookException(Failure failure, String message, Throwable cause) {
            super(message, cause);
            this.failure = failure;
        }
    }

    interface ConnectionFactory {
        HttpsURLConnection open(URL url) throws IOException;
    }

    private final ConnectionFactory connections;

    TaskWebhookClient() {
        this(url -> (HttpsURLConnection) url.openConnection());
    }

    TaskWebhookClient(ConnectionFactory connections) {
        if (connections == null) throw new IllegalArgumentException("Connection factory is required.");
        this.connections = connections;
    }

    int sendTask(String endpoint, Task task, boolean includeNotes) throws WebhookException {
        final URL url;
        final byte[] payload;
        try {
            url = validateEndpoint(endpoint);
            payload = TaskWebhookPayload.create(task, includeNotes).getBytes(StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw new WebhookException(Failure.INVALID_ENDPOINT,
                    "The webhook URL or selected task is invalid.", exception);
        }

        HttpsURLConnection connection = null;
        try {
            connection = connections.open(url);
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
            connection.setReadTimeout(READ_TIMEOUT_MILLIS);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setAllowUserInteraction(false);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(payload.length);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json, */*");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("User-Agent", "Daymark-Android-Webhook");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
                output.flush();
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new WebhookException(Failure.HTTP,
                        "The webhook returned HTTP " + status + ". No automatic retry was attempted.");
            }
            readLimited(connection.getInputStream());
            return status;
        } catch (WebhookException exception) {
            throw exception;
        } catch (UnknownHostException | SocketTimeoutException exception) {
            throw new WebhookException(Failure.OFFLINE,
                    "The webhook host could not be reached. Daymark remains usable offline.", exception);
        } catch (IOException exception) {
            throw new WebhookException(Failure.OFFLINE,
                    "The webhook request failed. Daymark remains usable offline.", exception);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static URL validateEndpoint(String endpoint) {
        if (endpoint == null || endpoint.trim().isEmpty()) {
            throw new IllegalArgumentException("Webhook endpoint is required.");
        }
        try {
            URI uri = new URI(endpoint);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null || uri.getHost().trim().isEmpty()
                    || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                    || uri.getPort() == 0 || uri.getPort() > 65535) {
                throw new IllegalArgumentException("Webhook endpoint must be a valid HTTPS URL without embedded credentials or fragments.");
            }
            return uri.toURL();
        } catch (URISyntaxException | IOException exception) {
            throw new IllegalArgumentException("Webhook endpoint is invalid.", exception);
        }
    }

    private static void readLimited(InputStream input) throws IOException, WebhookException {
        byte[] bytes;
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = stream.read(buffer)) != -1) {
                if (output.size() + read > MAX_RESPONSE_BYTES) {
                    throw new WebhookException(Failure.INVALID_RESPONSE,
                            "Webhook response exceeded the safe size limit.");
                }
                output.write(buffer, 0, read);
            }
            bytes = output.toByteArray();
        }
        try {
            StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes));
        } catch (CharacterCodingException exception) {
            throw new WebhookException(Failure.INVALID_RESPONSE,
                    "Webhook response was not valid UTF-8.", exception);
        }
    }
}
