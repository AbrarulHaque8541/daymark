#!/usr/bin/env sh
set -eu

# Diagnostic only (PR #676): surface the instrumentation failure excerpt as a
# GitHub error annotation so the failing assertion is visible without
# authenticated log access. Never alters pass/fail behavior.
report_failure_excerpt() {
  task="$1"
  gradle_log="$2"
  excerpt=""
  if command -v adb >/dev/null 2>&1; then
    excerpt="$(adb logcat -d -s DaymarkSWRuntime:I 2>/dev/null | tail -n 40 || true)"
  fi
  gradle_tail="$(tail -n 20 "$gradle_log" 2>/dev/null || true)"
  combined="$(adb logcat -d -s DaymarkSWRuntime 2>/dev/null | grep -E "FAIL after|Caused by" | tail -n 6 | tr "\n" " | " | tr -d "\r")"
  encoded="$(printf '%s' "$combined" | head -c 3500 | sed -e 's/%/%25/g' -e 's/\r/%0D/g' -e 's/\n/%0A/g')"
  echo "::error title=Service Worker trace failure ($task)::sw-trace-diagnostic: $encoded"
  lifecycle="$(adb logcat -d -s DaymarkWebView:I 2>/dev/null | grep -E "page (started|finished)|network block sync|spa-diag" | tail -n 20 | tr "\n" " | " | tr -d "\r")"
  lifecycle_encoded="$(printf '%s' "$lifecycle" | head -c 2500 | sed -e 's/%/%25/g' -e 's/\r/%0D/g' -e 's/\n/%0A/g')"
  echo "::error title=Service Worker trace lifecycle ($task)::sw-trace-lifecycle: $lifecycle_encoded"
}

run_variant() {
  task="$1"
  run_token="sw-$(date -u +%Y%m%dT%H%M%SZ)-$$-$task"
  gradle_log="$(mktemp)"
  echo "Running Service Worker runtime acceptance through $task (run token $run_token)"

  if ! ./gradlew --no-daemon ":service-worker-test:$task" \
      "-Pandroid.testInstrumentationRunnerArguments.runToken=$run_token" \
      --console=plain >"$gradle_log" 2>&1; then
    cat "$gradle_log" >&2
    adb logcat -d -s DaymarkSWRuntime:I >&2 || true
    report_failure_excerpt "$task" "$gradle_log"
    rm -f "$gradle_log"
    exit 1
  fi
  cat "$gradle_log"

  # Gradle may uninstall the test APK after connectedAndroidTest. Do not query
  # package-manager instrumentation metadata after the task: the successful test
  # result and its unique in-process marker are the authoritative evidence that it ran.
  if ! grep -Fq "Starting 1 tests on" "$gradle_log" \
      || ! grep -Fq "Finished 1 tests on" "$gradle_log"; then
    echo "Expected exactly one discovered and finished Service Worker JUnit test for $task." >&2
    adb logcat -d -s DaymarkSWRuntime:I >&2 || true
    report_failure_excerpt "$task" "$gradle_log"
    rm -f "$gradle_log"
    exit 1
  fi
  rm -f "$gradle_log"

  runtime_log="$(adb logcat -d -s DaymarkSWRuntime:I)"
  if printf '%s\n' "$runtime_log" | grep -Fq "run=$run_token FAIL after"; then
    printf '%s\n' "$runtime_log" >&2
    echo "Service Worker runtime instrumentation reported a failure." >&2
    exit 1
  fi
  if ! printf '%s\n' "$runtime_log" | grep -Eq "run=$run_token all Service Worker runtime phases passed; [1-9][0-9]* assertions"; then
    printf '%s\n' "$runtime_log" >&2
    echo "No success marker for this exact instrumentation invocation; zero-test runs are not acceptance." >&2
    exit 1
  fi
  printf '%s\n' "$runtime_log" | grep -E "run=$run_token all Service Worker runtime phases passed; [1-9][0-9]* assertions"
}

run_variant connectedGithubSideloadDebugAndroidTest
run_variant connectedPlayDebugAndroidTest
