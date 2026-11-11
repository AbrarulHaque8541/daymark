#!/usr/bin/env sh
set -eu
. tools/platform-instrumentation-repeat.sh

./gradlew --no-daemon installGithubSideloadDebug installGithubSideloadDebugAndroidTest

find_instrumentation_component() {
  adb shell pm list instrumentation 2>/dev/null | tr -d '\r' | parse_platform_instrumentation_component
}

# PackageManager can briefly lag the Gradle install task. Wait for registration
# only; once instrumentation starts, failures remain fail-fast with no retries.
instrumentation=""
attempt=1
while [ "$attempt" -le 20 ]; do
  instrumentation="$(find_instrumentation_component || true)"
  [ -n "$instrumentation" ] && break
  sleep 1
  attempt=$((attempt + 1))
done
if [ -z "$instrumentation" ]; then
  echo "DaymarkPlatformInstrumentation was not registered after install" >&2
  adb shell pm list instrumentation >&2
  exit 1
fi

echo "Running Android instrumentation component: $instrumentation"
instrumentation_output="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/platform-instrumentation-output.log"
mkdir -p "$(dirname "$instrumentation_output")"

run_bounded_diagnostic() {
  label="$1"
  shift
  echo "::group::$label"
  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM --kill-after=2s 8s "$@" 2>&1 || true
  else
    echo "timeout utility unavailable; skipped bounded diagnostic"
  fi | tail -n 120
  echo "::endgroup::"
}

report_failure() {
  body="$1"
  echo "::group::instrumentation output"
  printf '%s\n' "$body" | tail -n 100
  echo "::endgroup::"
  # A timeout before the first DaymarkInstr marker can be an instrumentation
  # process-start failure, not an in-test hang. Include framework crash and
  # activity-manager tags so that pre-onCreate failures are diagnosable.
  run_bounded_diagnostic "Android warning/error logcat" \
    adb logcat -d -t 1200 '*:W' 'DaymarkInstr:I'
  run_bounded_diagnostic "Registered Daymark instrumentation" \
    sh -c 'adb shell pm list instrumentation | grep -F "com.abrar.daymark"'
  run_bounded_diagnostic "Installed Daymark test package" \
    adb shell dumpsys package com.abrar.daymark.test
  run_bounded_diagnostic "Daymark app and instrumentation processes" \
    sh -c 'adb shell ps -A | grep -E "com\\.abrar\\.daymark(\\.test)?|instrumentation"'
  run_bounded_diagnostic "Activity manager Daymark state" \
    sh -c 'adb shell dumpsys activity | grep -i -E "instrumentation|com\\.abrar\\.daymark" | tail -n 80'
}

run_instrumentation_once() {
  : > "$instrumentation_output"
  adb logcat -c >/dev/null 2>&1 || true
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM --kill-after=10s 300s adb shell am instrument -w -r "$instrumentation" >"$instrumentation_output" 2>&1
    command_status=$?
  else
    echo "WARNING: timeout utility unavailable; running instrumentation without host-side timeout." >&2
    adb shell am instrument -w -r "$instrumentation" >"$instrumentation_output" 2>&1
    command_status=$?
  fi
  set -e

  output="$(cat "$instrumentation_output")"
  printf '%s\n' "$output"
  if [ "$command_status" -eq 124 ] || [ "$command_status" -eq 137 ]; then
    output="${output}
INSTRUMENTATION_ERROR: host command exceeded its 300-second timeout (exit $command_status)."
  fi
  if [ "$command_status" -ne 0 ] \
     || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: result=passed' \
     || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: main_activity_tabs_transition=passed'; then
    report_failure "$output"
    return 1
  fi
}

run_instrumentation_repeated run_instrumentation_once
