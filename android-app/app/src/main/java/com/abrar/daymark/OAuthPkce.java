package com.abrar.daymark;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * OAuth 2.0 Authorization Code + PKCE primitives for public Android clients.
 *
 * <p>This class deliberately does not perform network requests, persist credentials, embed client
 * secrets, or decide provider scopes. A caller must use an external user-agent, exact registered
 * redirect URI, TLS token endpoint and provider-specific consent policy.
 */
final class OAuthPkce {
    private static final int RANDOM_BYTES = 32;
    private static final int MIN_VERIFIER_LENGTH = 43;
    private static final int MAX_VERIFIER_LENGTH = 128;
    private static final int MAX_AUTHORIZATION_CODE_LENGTH = 4096;
    private static final int MAX_ERROR_LENGTH = 256;
    private static final int MAX_ERROR_DESCRIPTION_LENGTH = 1024;

    static final class Session {
        final String state;
        final String codeVerifier;
        final String codeChallenge;

        private Session(String state, String codeVerifier, String codeChallenge) {
            this.state = state;
            this.codeVerifier = codeVerifier;
            this.codeChallenge = codeChallenge;
        }

        boolean matchesState(String callbackState) {
            return constantTimeEquals(state, callbackState);
        }
    }

    static final class Callback {
        final String code;
        final String state;
        final String error;
        final String errorDescription;

        private Callback(String code, String state, String error, String errorDescription) {
            this.code = code;
            this.state = state;
            this.error = error;
            this.errorDescription = errorDescription;
        }

        boolean isSuccess() {
            return code != null && error == null;
        }
    }

    private OAuthPkce() { }

    static Session createSession() {
        SecureRandom random = new SecureRandom();
        byte[] stateBytes = new byte[RANDOM_BYTES];
        byte[] verifierBytes = new byte[RANDOM_BYTES];
        random.nextBytes(stateBytes);
        random.nextBytes(verifierBytes);
        String state = base64Url(stateBytes);
        String verifier = base64Url(verifierBytes);
        return new Session(state, verifier, challengeForVerifier(verifier));
    }

    static String challengeForVerifier(String verifier) {
        if (!isValidVerifier(verifier)) throw new IllegalArgumentException("Invalid PKCE code verifier.");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return base64Url(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable.", impossible);
        }
    }

    static boolean isValidVerifier(String verifier) {
        if (verifier == null || verifier.length() < MIN_VERIFIER_LENGTH
                || verifier.length() > MAX_VERIFIER_LENGTH) return false;
        for (int index = 0; index < verifier.length(); index++) {
            char value = verifier.charAt(index);
            boolean unreserved = (value >= 'A' && value <= 'Z')
                    || (value >= 'a' && value <= 'z')
                    || (value >= '0' && value <= '9')
                    || value == '-' || value == '.' || value == '_' || value == '~';
            if (!unreserved) return false;
        }
        return true;
    }

    static boolean constantTimeEquals(String expected, String actual) {
        if (expected == null || actual == null) return false;
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    static Callback parseCallback(String expectedRedirectUri, String callbackUri) {
        URI expected = parseUri(expectedRedirectUri);
        URI actual = parseUri(callbackUri);
        if (!sameRedirect(expected, actual) || actual.getRawQuery() == null
                || actual.getRawQuery().isEmpty()) {
            throw new IllegalArgumentException("OAuth callback does not match the registered redirect URI.");
        }

        Map<String, String> parameters = parseQuery(actual.getRawQuery());
        String state = parameters.get("state");
        String code = parameters.get("code");
        String error = parameters.get("error");
        String description = parameters.get("error_description");

        if (state == null || state.isEmpty() || state.length() > 256) {
            throw new IllegalArgumentException("OAuth callback is missing a valid state.");
        }
        if (code != null && (code.isEmpty() || code.length() > MAX_AUTHORIZATION_CODE_LENGTH)) {
            throw new IllegalArgumentException("OAuth authorization code is invalid.");
        }
        if (error != null && (error.isEmpty() || error.length() > MAX_ERROR_LENGTH)) {
            throw new IllegalArgumentException("OAuth error response is invalid.");
        }
        if (description != null && description.length() > MAX_ERROR_DESCRIPTION_LENGTH) {
            throw new IllegalArgumentException("OAuth error description is too long.");
        }
        if ((code == null) == (error == null)) {
            throw new IllegalArgumentException("OAuth callback must contain either a code or an error.");
        }
        return new Callback(code, state, error, description);
    }

    private static URI parseUri(String value) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("OAuth redirect URI is missing.");
        }
        try {
            URI uri = new URI(value);
            if (uri.getScheme() == null || uri.getHost() == null || uri.getRawUserInfo() != null
                    || uri.getRawFragment() != null) {
                throw new IllegalArgumentException("OAuth redirect URI is invalid.");
            }
            return uri;
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("OAuth redirect URI is invalid.", exception);
        }
    }

    private static boolean sameRedirect(URI expected, URI actual) {
        String expectedPath = expected.getRawPath() == null ? "" : expected.getRawPath();
        String actualPath = actual.getRawPath() == null ? "" : actual.getRawPath();
        return expected.getScheme().equalsIgnoreCase(actual.getScheme())
                && expected.getHost().equalsIgnoreCase(actual.getHost())
                && expected.getPort() == actual.getPort()
                && expectedPath.equals(actualPath)
                && expected.getRawQuery() == null;
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> result = new HashMap<>();
        String[] pairs = rawQuery.split("&", -1);
        for (String pair : pairs) {
            if (pair.isEmpty()) throw new IllegalArgumentException("OAuth callback contains an empty parameter.");
            int equals = pair.indexOf('=');
            String rawName = equals < 0 ? pair : pair.substring(0, equals);
            String rawValue = equals < 0 ? "" : pair.substring(equals + 1);
            String name = decode(rawName);
            String value = decode(rawValue);
            if (name.isEmpty() || result.containsKey(name)) {
                throw new IllegalArgumentException("OAuth callback contains a duplicate or empty parameter.");
            }
            if (!("code".equals(name) || "state".equals(name) || "error".equals(name)
                    || "error_description".equals(name) || "iss".equals(name)
                    || "session_state".equals(name))) {
                throw new IllegalArgumentException("OAuth callback contains an unexpected parameter.");
            }
            result.put(name, value);
        }
        return result;
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, "UTF-8");
        } catch (UnsupportedEncodingException impossible) {
            throw new IllegalStateException("UTF-8 is unavailable.", impossible);
        } catch (IllegalArgumentException malformedEncoding) {
            throw new IllegalArgumentException("OAuth callback contains malformed encoding.", malformedEncoding);
        }
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
