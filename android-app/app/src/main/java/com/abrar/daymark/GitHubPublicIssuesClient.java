package com.abrar.daymark;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Read-only adapter for public GitHub repository issues and pull requests.
 *
 * <p>Requests are anonymous and fixed to api.github.com. This adapter cannot access private
 * repositories, mutate issues, or bypass provider rate limits. Call it off the UI thread.
 */
final class GitHubPublicIssuesClient {
    private static final int CONNECT_TIMEOUT_MILLIS = 10_000;
    private static final int READ_TIMEOUT_MILLIS = 15_000;
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final Pattern OWNER = Pattern.compile("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?");
    private static final Pattern REPOSITORY = Pattern.compile("[A-Za-z0-9_.-]{1,100}");

    enum Failure { INVALID_INPUT, OFFLINE, RATE_LIMITED, HTTP, INVALID_RESPONSE }

    static final class IntegrationException extends Exception {
        final Failure failure;

        IntegrationException(Failure failure, String message) {
            super(message);
            this.failure = failure;
        }

        IntegrationException(Failure failure, String message, Throwable cause) {
            super(message, cause);
            this.failure = failure;
        }
    }

    static final class Issue {
        final int number;
        final String title;
        final String body;
        final String state;
        final String htmlUrl;
        final String updatedAt;
        final boolean pullRequest;

        Issue(int number, String title, String body, String state, String htmlUrl,
              String updatedAt, boolean pullRequest) {
            this.number = number;
            this.title = title;
            this.body = body;
            this.state = state;
            this.htmlUrl = htmlUrl;
            this.updatedAt = updatedAt;
            this.pullRequest = pullRequest;
        }
    }

    interface ConnectionFactory {
        HttpURLConnection open(URL url) throws IOException;
    }

    private final ConnectionFactory connections;

    GitHubPublicIssuesClient() {
        this(url -> (HttpURLConnection) url.openConnection());
    }

    GitHubPublicIssuesClient(ConnectionFactory connections) {
        if (connections == null) throw new IllegalArgumentException("Connection factory is required.");
        this.connections = connections;
    }

    List<Issue> fetchOpenIssues(String owner, String repository, int page, int perPage)
            throws IntegrationException {
        final URL endpoint;
        try {
            endpoint = new URL(buildEndpoint(owner, repository, page, perPage));
        } catch (IllegalArgumentException | IOException invalidInput) {
            throw new IntegrationException(Failure.INVALID_INPUT,
                    "Enter a valid public GitHub owner and repository.", invalidInput);
        }

        HttpURLConnection connection = null;
        try {
            connection = connections.open(endpoint);
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
            connection.setReadTimeout(READ_TIMEOUT_MILLIS);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            connection.setRequestProperty("User-Agent", "Daymark-Android-Integration");
            int status = connection.getResponseCode();
            if (status == 403 || status == 429) {
                throw new IntegrationException(Failure.RATE_LIMITED,
                        "GitHub rate-limited this public request. Try again later.");
            }
            if (status == HttpURLConnection.HTTP_NOT_FOUND) {
                throw new IntegrationException(Failure.HTTP,
                        "Repository was not found or is private. Anonymous access is read-only for public repositories.");
            }
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IntegrationException(Failure.HTTP,
                        "GitHub returned HTTP " + status + " for the public issues request.");
            }
            String response = readLimited(connection.getInputStream());
            return parseIssues(response, owner, repository);
        } catch (IntegrationException exception) {
            throw exception;
        } catch (UnknownHostException | SocketTimeoutException exception) {
            throw new IntegrationException(Failure.OFFLINE,
                    "GitHub could not be reached. Daymark remains usable offline.", exception);
        } catch (IOException exception) {
            throw new IntegrationException(Failure.OFFLINE,
                    "The public GitHub request failed. Daymark remains usable offline.", exception);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static String buildEndpoint(String owner, String repository, int page, int perPage) {
        if (owner == null || !OWNER.matcher(owner).matches()
                || repository == null || !REPOSITORY.matcher(repository).matches()
                || ".".equals(repository) || "..".equals(repository)
                || page < 1 || page > 10_000 || perPage < 1 || perPage > 100) {
            throw new IllegalArgumentException("Invalid GitHub public issues request.");
        }
        return "https://api.github.com/repos/" + owner + "/" + repository
                + "/issues?state=open&per_page=" + perPage + "&page=" + page;
    }

    static List<Issue> parseIssues(String json, String owner, String repository)
            throws IntegrationException {
        try {
            List<Object> values = StrictJsonParser.array(StrictJsonParser.parse(json), "GitHub issues");
            if (values.size() > 100) throw new IllegalArgumentException("GitHub returned too many issues.");
            List<Issue> result = new ArrayList<>();
            for (Object value : values) {
                Map<String, Object> object = StrictJsonParser.object(value, "GitHub issue");
                int number = StrictJsonParser.requiredInt(object, "number");
                String title = bounded(StrictJsonParser.requiredString(object, "title"), 512, "title");
                String body = bounded(StrictJsonParser.optionalString(object, "body", ""), 100_000, "body");
                String state = StrictJsonParser.requiredString(object, "state");
                String htmlUrl = bounded(StrictJsonParser.requiredString(object, "html_url"), 512, "html_url");
                String updatedAt = bounded(StrictJsonParser.requiredString(object, "updated_at"), 64, "updated_at");
                boolean pullRequest = object.containsKey("pull_request");
                if (number < 1 || !("open".equals(state) || "closed".equals(state))) {
                    throw new IllegalArgumentException("GitHub issue identity or state is invalid.");
                }
                validateHtmlUrl(htmlUrl, owner, repository, number, pullRequest);
                result.add(new Issue(number, title, body, state, htmlUrl, updatedAt, pullRequest));
            }
            return Collections.unmodifiableList(result);
        } catch (RuntimeException exception) {
            throw new IntegrationException(Failure.INVALID_RESPONSE,
                    "GitHub returned an invalid issues response.", exception);
        }
    }

    private static String bounded(String value, int maxLength, String field) {
        if (value == null || value.length() > maxLength) {
            throw new IllegalArgumentException("GitHub " + field + " is outside its safe size limit.");
        }
        return value;
    }

    private static void validateHtmlUrl(String value, String owner, String repository,
                                        int number, boolean pullRequest) {
        try {
            URI uri = new URI(value);
            String path = "/" + owner + "/" + repository
                    + (pullRequest ? "/pull/" : "/issues/") + number;
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || !"github.com".equalsIgnoreCase(uri.getHost())
                    || uri.getPort() != -1
                    || uri.getRawUserInfo() != null
                    || uri.getRawFragment() != null
                    || uri.getRawQuery() != null
                    || !path.equals(uri.getRawPath())) {
                throw new IllegalArgumentException("GitHub issue link did not match the requested repository.");
            }
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("GitHub issue link is invalid.", exception);
        }
    }

    private static String readLimited(InputStream input) throws IOException, IntegrationException {
        byte[] bytes;
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) {
                if (output.size() + read > MAX_RESPONSE_BYTES) {
                    throw new IntegrationException(Failure.INVALID_RESPONSE,
                            "GitHub issues response exceeded the safe size limit.");
                }
                output.write(buffer, 0, read);
            }
            bytes = output.toByteArray();
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) {
            throw new IntegrationException(Failure.INVALID_RESPONSE,
                    "GitHub issues response was not valid UTF-8.", exception);
        }
    }
}
