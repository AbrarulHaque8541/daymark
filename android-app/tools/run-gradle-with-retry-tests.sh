#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SCRIPT="$TOOLS_DIR/run-gradle-with-retry.sh"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT

make_case() {
  local name="$1"
  local mode="$2"
  local dir="$TEMP_ROOT/$name"
  mkdir -p "$dir/android-app/tools" "$dir/android-app/gradle/wrapper"
  : > "$dir/android-app/gradle/wrapper/gradle-wrapper.properties"
  cp "$SOURCE_SCRIPT" "$dir/android-app/tools/run-gradle-with-retry.sh"
  cat > "$dir/android-app/gradlew" <<'FAKE_GRADLE'
#!/usr/bin/env bash
set -euo pipefail
count="$(cat "$COUNT_FILE" 2>/dev/null || printf '0')"
count=$((count + 1))
printf '%s' "$count" > "$COUNT_FILE"
case "$FAKE_MODE" in
  retry-once)
    if [[ "$count" -eq 1 ]]; then
      echo "Exception in thread main: Server returned HTTP response code: 504 for URL: https://github.com/gradle/gradle-distributions/releases/download/v8.13.0/gradle-8.13-bin.zip"
      exit 1
    fi
    ;;
  permanent-failure)
    echo "Execution failed for task ':app:compileDebugJavaWithJavac'"
    exit 7
    ;;
  always-504)
    echo "Server returned HTTP response code: 504 for URL: https://github.com/gradle/gradle-distributions/releases/download/v8.13.0/gradle-8.13-bin.zip"
    exit 1
    ;;
  *)
    echo "Unknown fake mode" >&2
    exit 9
    ;;
esac
echo "BUILD SUCCESSFUL"
FAKE_GRADLE
  chmod +x "$dir/android-app/gradlew"
  printf '%s' "$mode" > "$dir/mode"
}

# A transient Gradle distribution 504 is retried once and then succeeds.
make_case "retry" "retry-once"
retry_dir="$TEMP_ROOT/retry"
COUNT_FILE="$retry_dir/count" FAKE_MODE=retry-once DAYMARK_GRADLE_RETRY_INITIAL_DELAY_SECONDS=0 \
  bash "$retry_dir/android-app/tools/run-gradle-with-retry.sh" --no-daemon assembleDebug \
  > "$retry_dir/output.log" 2>&1
[[ "$(cat "$retry_dir/count")" == "2" ]] || {
  cat "$retry_dir/output.log" >&2
  echo "Expected exactly two attempts for one transient 504" >&2
  exit 1
}
grep -q "retrying attempt 2/3" "$retry_dir/output.log"

# A real compilation/build failure is not retried.
make_case "build-failure" "permanent-failure"
failure_dir="$TEMP_ROOT/build-failure"
set +e
COUNT_FILE="$failure_dir/count" FAKE_MODE=permanent-failure DAYMARK_GRADLE_RETRY_INITIAL_DELAY_SECONDS=0 \
  bash "$failure_dir/android-app/tools/run-gradle-with-retry.sh" --no-daemon assembleDebug \
  > "$failure_dir/output.log" 2>&1
failure_status=$?
set -e
[[ "$failure_status" -eq 7 && "$(cat "$failure_dir/count")" == "1" ]] || {
  cat "$failure_dir/output.log" >&2
  echo "A non-network build failure must exit immediately without retry" >&2
  exit 1
}

# Repeated 504s are bounded to three total attempts.
make_case "exhausted" "always-504"
exhausted_dir="$TEMP_ROOT/exhausted"
set +e
COUNT_FILE="$exhausted_dir/count" FAKE_MODE=always-504 DAYMARK_GRADLE_RETRY_INITIAL_DELAY_SECONDS=0 \
  bash "$exhausted_dir/android-app/tools/run-gradle-with-retry.sh" --no-daemon assembleDebug \
  > "$exhausted_dir/output.log" 2>&1
exhausted_status=$?
set -e
[[ "$exhausted_status" -eq 1 && "$(cat "$exhausted_dir/count")" == "3" ]] || {
  cat "$exhausted_dir/output.log" >&2
  echo "Repeated distribution 504s must stop after three total attempts" >&2
  exit 1
}

echo "PASS run-gradle-with-retry: transient 504 retry, non-network failure no-retry, and bounded exhaustion"
