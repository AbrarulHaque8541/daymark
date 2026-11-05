#!/usr/bin/env sh
set -eu

# Emits the real instrumentation failure lines and the app-local phase log as
# workflow error annotations so the failing phase/assertion is visible from the
# public annotations API without sign-in. Pure diagnostics: no check is weakened.
report_failure() {
  body="$1"
  phase_log="${2:-}"
  if [ -z "$phase_log" ]; then
    for pkg in com.abrar.daymark com.abrar.daymark.debug; do
      phase_log="$(adb shell run-as "$pkg" sh -c 'cat files/instrumentation-phases.log' 2>/dev/null | tr -d '\r' || true)"
      [ -n "$phase_log" ] && break
    done
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
instrumentation_output="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/platform-instrumentation-output.log"
phase_log_path="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/instrumentation-phases.log"
set +e
timeout --signal=TERM --kill-after=10s 300s adb shell am instrument -w -r "$instrumentation" >"$instrumentation_output" 2>&1
instrument_status=$?
set -e
output="$(cat "$instrumentation_output")"
printf '%s\n' "$output"
if [ "$instrument_status" -eq 124 ]; then
  phase_log=""
  for pkg in com.abrar.daymark com.abrar.daymark.debug; do
    phase_log="$(adb shell run-as "$pkg" sh -c 'cat files/instrumentation-phases.log' 2>/dev/null | tr -d '\r' || true)"
    [ -n "$phase_log" ] && break
  done
  printf '%s\n' "$phase_log" >"$phase_log_path"
  echo "::group::instrumentation-phases.log captured after instrumentation timed out at 300 seconds"
  cat "$phase_log_path"
  echo "::endgroup::"
  report_failure "$output" "$phase_log"
  exit 1
fi
if [ "$instrument_status" -ne 0 ] \
   || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: result=passed' \
   || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: main_activity_tabs_transition=passed'; then
  report_failure "$output"
  exit 1
fi
