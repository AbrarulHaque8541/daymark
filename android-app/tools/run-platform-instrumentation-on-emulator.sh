#!/usr/bin/env sh
set -eu

# Emits the real instrumentation failure lines and the app-local phase log as
# workflow error annotations so the failing phase/assertion is visible from the
# public annotations API without sign-in. Pure diagnostics: no check is weakened.
report_failure() {
  body="$1"
  phase_log=""
  for pkg in com.abrar.daymark com.abrar.daymark.debug; do
    phase_log="$(adb shell run-as "$pkg" sh -c 'cat files/instrumentation-phases.log' 2>/dev/null | tr -d '\r' || true)"
    [ -n "$phase_log" ] && break
  done
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
set +e
if command -v timeout >/dev/null 2>&1; then
  output="$(timeout --kill-after=15s 8m adb shell am instrument -w -r "$instrumentation" 2>&1)"
  instrument_status=$?
  if [ "$instrument_status" -eq 124 ] || [ "$instrument_status" -eq 137 ]; then
    output="${output}
INSTRUMENTATION_ERROR: host instrumentation command exceeded its 8-minute timeout."
  fi
else
  echo "WARNING: timeout utility unavailable; running instrumentation without host-side timeout." >&2
  output="$(adb shell am instrument -w -r "$instrumentation" 2>&1)"
  instrument_status=$?
fi
set -e
printf '%s\n' "$output"
if [ "$instrument_status" -ne 0 ] \
   || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: result=passed' \
   || ! printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: main_activity_tabs_transition=passed'; then
  report_failure "$output"
  exit 1
fi
