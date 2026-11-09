#!/usr/bin/env sh
set -eu

run_variant() {
  task="$1"
  run_token="$(date -u +%Y%m%dT%H%M%SZ)-$$-$task"
  echo "Running Service Worker runtime acceptance through $task (run token $run_token)"

  # Do not clear logcat: some supported emulator images reject clearing the main
  # buffer. A unique runner argument makes stale success markers unusable.
  ./gradlew --no-daemon \
    "-Pandroid.testInstrumentationRunnerArguments.class=com.abrar.daymark.serviceworkertest.DaymarkServiceWorkerInstrumentation" \
    "-Pandroid.testInstrumentationRunnerArguments.runToken=$run_token" \
    ":service-worker-test:$task"

  instrumentation="$(adb shell pm list instrumentation)"
  printf '%s\n' "$instrumentation"
  if ! printf '%s\n' "$instrumentation" | grep -Fq "androidx.test.runner.AndroidJUnitRunner"; then
    echo "The JUnit instrumentation runner is not registered in the installed test APK." >&2
    exit 1
  fi

  runtime_log="$(adb logcat -d -s DaymarkSWRuntime:I)"
  if printf '%s\n' "$runtime_log" | grep -Fq "run=$run_token FAIL after"; then
    printf '%s\n' "$runtime_log" >&2
    echo "Service Worker runtime instrumentation reported a failure." >&2
    exit 1
  fi
  if ! printf '%s\n' "$runtime_log" | grep -Fq "run=$run_token all Service Worker runtime phases passed;"; then
    printf '%s\n' "$runtime_log" >&2
    echo "No success marker for this exact instrumentation invocation; zero discovered tests are not acceptance." >&2
    exit 1
  fi
  printf '%s\n' "$runtime_log" | grep -F "run=$run_token all Service Worker runtime phases passed;"
}

# Run both target-app distribution variants explicitly; the aggregate task
# cannot disambiguate the two tested APKs in this multi-flavor project.
run_variant connectedGithubSideloadDebugAndroidTest
run_variant connectedPlayDebugAndroidTest
