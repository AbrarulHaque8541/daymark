#!/usr/bin/env sh
set -eu
. tools/platform-instrumentation-repeat.sh
. tools/platform-instrumentation-input-bridge.sh

# Emits the real instrumentation failure lines and the app-local phase log as
# workflow error annotations so the failing phase/assertion is visible from the
# public annotations API without sign-in. Pure diagnostics: no check is weakened.
read_phase_log() {
  pkg="$1"
  # adb can remain blocked after an instrumentation process has already failed.
  # Bound each best-effort read so diagnostics never outlive the test command.
  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM --kill-after=2s 8s \
      adb shell run-as "$pkg" sh -c 'cat files/instrumentation-phases.log' 2>/dev/null \
      | tr -d '\r' || true
  fi
  return 0
}

report_failure() {
  body="$1"
  phase_log="${2:-}"
  if [ -z "$phase_log" ]; then
    for pkg in "$input_package" com.abrar.daymark com.abrar.daymark.debug; do
      phase_log="$(read_phase_log "$pkg")"
      [ -n "$phase_log" ] && break
    done
  fi
  if [ -z "$phase_log" ]; then
    phase_log="INSTRUMENTATION_PHASE_LOG: unavailable (missing file or bounded adb read timed out)."
  fi
  {
    printf '%s\n' "$body" | grep -E 'INSTRUMENTATION_|AssertionError|Exception|Error|failed' | tail -n 6
    printf '%s\n' "$phase_log" | tail -n 10
  } | tail -n 14 | while IFS= read -r line; do
    [ -n "$line" ] || continue
    msg="$(printf '%s' "$line" | cut -c1-200 | sed 's/%/%25/g; s/\r//g; s/::/%3A%3A/g')"
    printf '::error title=instrumentation-diagnostics::%s\n' "$msg"
  done
}

./gradlew --no-daemon installGithubSideloadDebug installGithubSideloadDebugAndroidTest

instrumentation="$(adb shell pm list instrumentation | tr -d '\r' | sed -n 's/^instrumentation:\([^ ]*DaymarkPlatformInstrumentation\).*/\1/p' | head -n 1)"
if [ -z "$instrumentation" ]; then
  echo "DaymarkPlatformInstrumentation was not installed" >&2
  adb shell pm list instrumentation >&2
  exit 1
fi

echo "Running Android instrumentation component: $instrumentation"
input_package="com.abrar.daymark.test"
if ! adb shell run-as "$input_package" sh -c 'test -d files && test -w files' >/dev/null 2>&1; then
  echo "Instrumentation test package $input_package is not accessible through run-as; host input bridge cannot operate." >&2
  exit 1
fi
instrumentation_output="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/platform-instrumentation-output.log"
phase_log_path="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/instrumentation-phases.log"
run_instrumentation_once() {
status_file="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/platform-instrumentation-status.$$"
rm -f "$status_file"
adb shell run-as "$input_package" sh -c 'rm -f files/daymark-instrumentation-input-request.txt files/daymark-instrumentation-input-result.txt files/daymark-instrumentation-input-request.txt.tmp files/daymark-instrumentation-input-result.tmp files/instrumentation-phases.log' >/dev/null 2>&1 || true
(
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM --kill-after=10s 300s adb shell am instrument -w -r "$instrumentation" >"$instrumentation_output" 2>&1
    command_status=$?
  else
    echo "WARNING: timeout utility unavailable; running instrumentation without host-side timeout." >&2
    adb shell am instrument -w -r "$instrumentation" >"$instrumentation_output" 2>&1
    command_status=$?
  fi
  printf '%s\n' "$command_status" >"$status_file"
) &
instrumentation_pid=$!
bridge_status=0
drive_instrumentation_input_bridge "$input_package" "$status_file" || bridge_status=$?
set +e
wait "$instrumentation_pid"
wait_status=$?
set -e
if [ -f "$status_file" ]; then
  instrument_status="$(cat "$status_file")"
else
  instrument_status=1
fi
rm -f "$status_file"
output="$(cat "$instrumentation_output")"
if [ "$bridge_status" -ne 0 ]; then
  output="${output}
INPUT_BRIDGE_ERROR: host input bridge exited with status $bridge_status."
fi
adb shell run-as "$input_package" sh -c 'rm -f files/daymark-instrumentation-input-request.txt files/daymark-instrumentation-input-result.txt files/daymark-instrumentation-input-request.txt.tmp files/daymark-instrumentation-input-result.tmp files/instrumentation-phases.log' >/dev/null 2>&1 || true
if [ "$instrument_status" -eq 124 ] || [ "$instrument_status" -eq 137 ]; then
  phase_log=""
  for pkg in com.abrar.daymark com.abrar.daymark.debug; do
    phase_log="$(read_phase_log "$pkg")"
    [ -n "$phase_log" ] && break
  done
  if [ -z "$phase_log" ]; then
    phase_log="INSTRUMENTATION_PHASE_LOG: unavailable (missing file or bounded adb read timed out)."
  fi
  printf '%s\n' "$phase_log" >"$phase_log_path"
  output="${output}
INSTRUMENTATION_ERROR: host command exceeded its 300-second timeout (exit $instrument_status)."
  printf '%s\n' "$output"
  echo "::group::instrumentation-phases.log captured after instrumentation timed out at 300 seconds"
  cat "$phase_log_path"
  echo "::endgroup::"
  report_failure "$output" "$phase_log"
  return 1
fi
printf '%s\n' "$output"
if [ "$instrument_status" -ne 0 ] \
   || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: result=passed' \
   || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: main_activity_tabs_transition=passed'; then
  report_failure "$output"
  return 1
fi
}

run_instrumentation_repeated run_instrumentation_once
