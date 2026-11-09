#!/usr/bin/env sh
set -eu

run_variant() {
  task="$1"
  echo "Running Service Worker runtime acceptance through $task"
  adb logcat -c
  ./gradlew --no-daemon ":service-worker-test:$task"

  instrumentation="$(adb shell pm list instrumentation)"
  printf '%s\n' "$instrumentation"
  if ! printf '%s\n' "$instrumentation" | grep -Fq "DaymarkServiceWorkerInstrumentation"; then
    echo "The custom Service Worker instrumentation component is not registered." >&2
    exit 1
  fi

  runtime_log="$(adb logcat -d -s DaymarkSWRuntime:I)"
  if printf '%s\n' "$runtime_log" | grep -Fq "FAIL after"; then
    printf '%s\n' "$runtime_log" >&2
    echo "Service Worker runtime instrumentation reported a failure." >&2
    exit 1
  fi
  if ! printf '%s\n' "$runtime_log" | grep -Eq "all Service Worker runtime phases passed; [1-9][0-9]* assertions"; then
    printf '%s\n' "$runtime_log" >&2
    echo "Gradle completed without a verified Service Worker runtime success marker; zero discovered tests are not acceptance." >&2
    exit 1
  fi
  printf '%s\n' "$runtime_log" | grep -E "all Service Worker runtime phases passed; [1-9][0-9]* assertions"
}

# Run both target-app distribution variants explicitly; the aggregate task
# cannot disambiguate the two tested APKs in this multi-flavor project.
run_variant connectedGithubSideloadDebugAndroidTest
run_variant connectedPlayDebugAndroidTest
