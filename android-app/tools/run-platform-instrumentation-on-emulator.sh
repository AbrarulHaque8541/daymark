#!/usr/bin/env sh
set -eu
. tools/platform-instrumentation-repeat.sh

./gradlew --no-daemon installGithubSideloadDebug installGithubSideloadDebugAndroidTest

instrumentation="$(adb shell pm list instrumentation | tr -d '\r' | awk '/^instrumentation:/ && /DaymarkPlatformInstrumentation/ { sub(/^instrumentation:/, ""); sub(/ .*/, ""); print; exit }')"
if [ -z "$instrumentation" ]; then
  echo "DaymarkPlatformInstrumentation was not installed" >&2
  adb shell pm list instrumentation >&2
  exit 1
fi

echo "Running Android instrumentation component: $instrumentation"
instrumentation_output="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/platform-instrumentation-output.log"
mkdir -p "$(dirname "$instrumentation_output")"

report_failure() {
  body="$1"
  echo "::group::instrumentation output"
  printf '%s\n' "$body" | tail -n 100
  echo "::endgroup::"
  echo "::group::Daymark instrumentation logcat"
  adb logcat -d -t 500 -s DaymarkInstr:I 2>/dev/null | tail -n 100 || true
  echo "::endgroup::"
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
