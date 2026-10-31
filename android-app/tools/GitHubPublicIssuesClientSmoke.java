successfully downloaded text file (SHA: d1bf63ac0b2238da6e1c086ffd96b2fa531a5499)package com.abrar.daymark;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Host-side tests for the anonymous, read-only public GitHub issues adapter. */
public final class GitHubPublicIssuesClientSmoke {
    public static void main(String[] args) throws Exception {
        String endpoint = GitHubPublicIssuesClient.buildEndpoint("octo-user", "daymark_app", 2, 50);
        check("https://api.github.com/repos/octo-user/daymark_app/issues?state=open&per_page=50&page=2"
                .equals(endpoint), "endpoint is fixed to GitHub HTTPS and bounded query parameters");
        expectIllegal(() -> GitHubPublicIssuesClient.buildEndpoint("../attacker", "repo", 1, 30),
                "owner path traversal is rejected");
        expectIllegal(() -> GitHubPublicIssuesClient.buildEndpoint("octo", "repo?state=all", 1, 30),
                "repository query injection is rejected");
        expectIllegal(() -> GitHubPublicIssuesClient.buildEndpoint("octo", "repo", 0, 30),
                "page zero is rejected");
        expectIllegal(() -> GitHubPublicIssuesClient.buildEndpoint("octo", "repo", 1, 101),
                "page size above 100 is rejected");

        String json = "["
                + "{\"number\":7,\"title\":\"Fix bug\",\"body\":\"Details\",\"state\":\"open\","
                + "\"html_url\":\"https://github.com/octo-user/daymark_app/issues/7\","
                + "\"updated_at\":\"2026-10-30T12:00:00Z\"},"
                + "{\"number\":8,\"title\":\"Add feature\",\"body\":null,\"state\":\"open\","
                + "\"html_url\":\"https://github.com/octo-user/daymark_app/pull/8\","
                + "\"updated_at\":\"2026-10-30T13:00:00Z\","
                + "\"pull_request\":{\"url\":\"https://api.github.com/repos/octo-user/daymark_app/pulls/8\"}}"
                + "]";
        List<GitHubPublicIssuesClient.Issue> parsed =
                GitHubPublicIssuesClient.parseIssues(json, "octo-user", "daymark_app");
        check(parsed.size() == 2, "both issues and pull requests are returned");
        check(parsed.get(0).number == 7 && !parsed.get(0).pullRequest, "issue identity is parsed");
        check("Fix bug".equals(parsed.get(0).title) && "Details".equals(parsed.get(0).body),
                "issue title/body are preserved");
        check(parsed.get(1).pullRequest && parsed.get(1).body.isEmpty(),
                "pull request detection and null body fallback are correct");
        try {
            parsed.clear();
            throw new AssertionError("issue results must be immutable");
        } catch (UnsupportedOperationException expected) {
            // Expected.
        }

        expectInvalidResponse("[{\"number\":7,\"title\":\"Wrong host\",\"body\":\"\",\"state\":\"open\","
                + "\"html_url\":\"https://evil.example/octo-user/daymark_app/issues/7\","
                + "\"updated_at\":\"2026-10-30T12:00:00Z\"}]",
                "issue links from untrusted hosts are rejected");
        expectInvalidResponse("[{\"number\":7,\"title\":\"Wrong path\",\"body\":\"\",\"state\":\"open\","
                + "\"html_url\":\"https://github.com/octo-user/other/issues/7\","
                + "\"updated_at\":\"2026-10-30T12:00:00Z\"}]",
                "issue links outside the requested repository are rejected");
        expectInvalidResponse("[{\"number\":7,\"title\":\"Wrong type\",\"body\":4,\"state\":\"open\","
                + "\"html_url\":\"https://github.com/octo-user/daymark_app/issues/7\","
                + "\"updated_at\":\"2026-10-30T12:00:00Z\"}]",
                "malformed issue fields are rejected");

        FakeConnection success = new FakeConnection(new URL(endpoint), 200, json.getBytes(StandardCharsets.UTF_8));
        GitHubPublicIssuesClient client = new GitHubPublicIssuesClient(url -> success);
        check(client.fetchOpenIssues("octo-user", "daymark_app", 2, 50).size() == 2,
                "successful public issue response is returned");
        check(!success.getInstanceFollowRedirects(), "HTTP redirects are disabled");
        check("application/vnd.github+json".equals(success.getRequestProperty("Accept")),
                "GitHub JSON media type is requested");
        check("2022-11-28".equals(success.getRequestProperty("X-GitHub-Api-Version")),
                "GitHub API version is explicit");
        check(success.getRequestProperty("Authorization") == null,
                "public adapter sends no credential or bearer token");
        check(success.disconnected, "connection is always disconnected");

        expectFailure(403, GitHubPublicIssuesClient.Failure.RATE_LIMITED, "rate limits are surfaced");
        expectFailure(429, GitHubPublicIssuesClient.Failure.RATE_LIMITED, "HTTP 429 is rate limited");
        expectFailure(404, GitHubPublicIssuesClient.Failure.HTTP, "private/missing repositories are not bypassed");
        expectFailure(302, GitHubPublicIssuesClient.Failure.HTTP, "redirects are not followed");
        FakeConnection oversized = new FakeConnection(new URL(endpoint), 200, new byte[2 * 1024 * 1024 + 1]);
        try {
            new GitHubPublicIssuesClient(url -> oversized).fetchOpenIssues("octo-user", "daymark_app", 1, 100);
            throw new AssertionError("oversized response must fail closed");
        } catch (GitHubPublicIssuesClient.IntegrationException expected) {
            check(expected.failure == GitHubPublicIssuesClient.Failure.INVALID_RESPONSE,
                    "oversized response is classified as invalid");
        }

        System.out.println("PASS GitHub public issues adapter");
    }

    private static void expectFailure(int status, GitHubPublicIssuesClient.Failure expected, String message)
            throws Exception {
        URL url = new URL(GitHubPublicIssuesClient.buildEndpoint("octo", "repo", 1, 30));
        FakeConnection connection = new FakeConnection(url, status, new byte[0]);
        try {
            new GitHubPublicIssuesClient(ignored -> connection).fetchOpenIssues("octo", "repo", 1, 30);
            throw new AssertionError(message);
        } catch (GitHubPublicIssuesClient.IntegrationException failure) {
            check(failure.failure == expected, message);
        }
    }

    private static void expectInvalidResponse(String json, String message) throws Exception {
        try {
            GitHubPublicIssuesClient.parseIssues(json, "octo-user", "daymark_app");
            throw new AssertionError(message);
        } catch (GitHubPublicIssuesClient.IntegrationException expected) {
            check(expected.failure == GitHubPublicIssuesClient.Failure.INVALID_RESPONSE, message);
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

    private static final class FakeConnection extends HttpURLConnection {
        final int status;
        final byte[] body;
        boolean disconnected;

        FakeConnection(URL url, int status, byte[] body) {
            super(url);
            this.status = status;
            this.body = body;
        }

        @Override public void disconnect() { disconnected = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { }
        @Override public int getResponseCode() { return status; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(body); }
    }
}
