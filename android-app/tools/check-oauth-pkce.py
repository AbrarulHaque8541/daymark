#!/usr/bin/env python3
"""Source guard for public-client OAuth PKCE and exact redirect validation."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
source = (root / "app/src/main/java/com/abrar/daymark/OAuthPkce.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
test = root / "tools/OAuthPkceSmoke.java"

for token in ("new SecureRandom()", "MessageDigest.getInstance(\"SHA-256\")",
              "Base64.getUrlEncoder().withoutPadding()", "MessageDigest.isEqual(",
              "sameRedirect(expected, actual)", "expected.getHost().equalsIgnoreCase(actual.getHost())",
              "expectedPath.equals(actualPath)", "actual.getRawQuery()",
              "result.containsKey(name)", "code and an error"):
    assert token in source, f"OAuth PKCE implementation missing security contract: {token}"

for forbidden in ("client_secret", "SharedPreferences", "Log.", "HttpURLConnection",
                  "OkHttpClient", "Authorization: Bearer"):
    assert forbidden not in source, f"OAuth PKCE primitive must not embed secrets, persistence or network: {forbidden}"

assert "OAuthPkceSmoke.java" in runner and "OAuthPkce.java" in runner
assert test.is_file()
print("PASS OAuth PKCE source security guard")
