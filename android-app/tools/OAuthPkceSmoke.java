package com.abrar.daymark;
/** Host-side security regression checks for the OAuth PKCE/callback parser. */
public final class OAuthPkceSmoke {
    public static void main(String[] args) {
        String verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        check(OAuthPkce.isValidVerifier(verifier), "RFC 7636 verifier is valid");
        check("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM".equals(
                OAuthPkce.challengeForVerifier(verifier)), "S256 challenge matches RFC 7636 test vector");
        check(!OAuthPkce.isValidVerifier("short"), "short verifier is rejected");
        check(!OAuthPkce.isValidVerifier(verifier + "="), "padding is not permitted in a PKCE verifier");
        check(!OAuthPkce.isValidVerifier(verifier + " "), "whitespace is not permitted in a PKCE verifier");
        check(!OAuthPkce.isValidVerifier(null), "missing verifier is rejected");

        OAuthPkce.Session first = OAuthPkce.createSession();
        OAuthPkce.Session second = OAuthPkce.createSession();
        check(OAuthPkce.isValidVerifier(first.codeVerifier), "generated verifier meets RFC length/character rules");
        check(first.codeChallenge.length() == 43, "S256 challenge is base64url without padding");
        check(first.state.length() >= 43, "state is generated from cryptographically random bytes");
        check(first.matchesState(first.state), "the original state matches");
        check(!first.matchesState(second.state), "another authorization session state does not match");
        check(!first.matchesState(null), "missing callback state fails closed");

        String redirect = "https://daymark.example/oauth/callback";
        OAuthPkce.Callback success = OAuthPkce.parseCallback(
                redirect, redirect + "?code=abc123&state=" + first.state + "&iss=https%3A%2F%2Fissuer.example");
        check(success.isSuccess() && "abc123".equals(success.code), "valid authorization code is parsed");
        check(first.matchesState(success.state), "callback state is independently verified by the session");

        OAuthPkce.Callback denied = OAuthPkce.parseCallback(
                redirect, redirect + "?error=access_denied&state=" + first.state
                        + "&error_description=User%20cancelled");
        check(!denied.isSuccess() && "access_denied".equals(denied.error),
                "provider denial is represented without an authorization code");

        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                "https://attacker.example/oauth/callback?code=x&state=" + first.state),
                "different redirect host is rejected");
        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                "https://daymark.example/other?code=x&state=" + first.state),
                "different redirect path is rejected");
        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                "http://daymark.example/oauth/callback?code=x&state=" + first.state),
                "redirect scheme downgrade is rejected");
        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                redirect + "?code=x&state=" + first.state + "#fragment"),
                "callback fragments are rejected");
        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                redirect + "?code=x&state=" + first.state + "&state=" + first.state),
                "duplicate state is rejected");
        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                redirect + "?code=x&error=access_denied&state=" + first.state),
                "code and error cannot coexist");
        expectFailure(() -> OAuthPkce.parseCallback(redirect, redirect + "?code=x"),
                "missing state is rejected");
        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                redirect + "?code=x&state=%ZZ"),
                "malformed percent encoding is rejected");
        expectFailure(() -> OAuthPkce.parseCallback(redirect,
                redirect + "?code=x&state=" + first.state + "&unexpected=1"),
                "unexpected callback parameters are rejected");
        expectFailure(() -> OAuthPkce.challengeForVerifier("invalid"),
                "challenge generation refuses an invalid verifier");

        System.out.println("PASS OAuth PKCE primitives and callback validation");
    }

    private static void expectFailure(Runnable operation, String message) {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected fail-closed behavior.
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
