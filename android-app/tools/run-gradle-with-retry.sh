#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Usage: run-gradle-with-retry.sh <gradle arguments...>" >&2
  exit 2
fi

ANDROID_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ANDROID_DIR"

if [[ ! -f ./gradlew || ! -f ./gradle/wrapper/gradle-wrapper.properties ]]; then
  echo "Android Gradle wrapper is missing from $ANDROID_DIR" >&2
  exit 2
fi

chmod +x ./gradlew

max_attempts=3
initial_delay="${DAYMARK_GRADLE_RETRY_INITIAL_DELAY_SECONDS:-2}"
if [[ ! "$initial_delay" =~ ^[0-9]{1,2}$ ]] || (( initial_delay > 30 )); then
  echo "DAYMARK_GRADLE_RETRY_INITIAL_DELAY_SECONDS must be an integer from 0 through 30" >&2
  exit 2
fi

is_retryable_distribution_failure() {
  grep -Eiq 'Server returned HTTP response code: 5[0-9]{2} for URL: .*gradle-[^/[:space:]]+-bin\.zip' "$1"
}

attempt=1
delay="$initial_delay"
while true; do
  log_file="$(mktemp)"
  set +e
  ./gradlew "$@" 2>&1 | tee "$log_file"
  status=${PIPESTATUS[0]}
  set -e

  if [[ "$status" -eq 0 ]]; then
    rm -f "$log_file"
    exit 0
  fi

  if [[ "$attempt" -lt "$max_attempts" ]] && is_retryable_distribution_failure "$log_file"; then
    next_attempt=$((attempt + 1))
    printf 'Gradle distribution server returned a transient 5xx response; retrying attempt %s/%s after %ss.\n' \
      "$next_attempt" "$max_attempts" "$delay" >&2
    rm -f "$log_file"
    sleep "$delay"
    attempt="$next_attempt"
    delay=$((delay * 2))
    continue
  fi

  rm -f "$log_file"
  exit "$status"
done
