#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sh -n "$ROOT/tools/run-platform-instrumentation-on-emulator.sh"
sh -n "$ROOT/tools/run-platform-instrumentation-touch-sequence-tests.sh"
sh -n "$ROOT/tools/platform-instrumentation-repeat.sh"
. "$ROOT/tools/platform-instrumentation-repeat.sh"
TMP=$(mktemp -d "daymark-instrumentation-repeat.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
sh "$ROOT/tools/run-platform-instrumentation-touch-sequence-tests.sh"
RUN_LOG="$TMP/runs.log"
ADB_LOG="$TMP/adb.log"
export RUN_LOG ADB_LOG
fail() { echo "FAIL: $*" >&2; exit 1; }
line_count() { wc -l < "$1" | tr -d '[:space:]'; }
assert_eq() { [ "$1" = "$2" ] || fail "$3 (expected $2, got $1)"; }
component="$(printf '%s\n' \
  'package:com.abrar.daymark.test' \
  'instrumentation:com.abrar.daymark.test/com.abrar.daymark.DaymarkPlatformInstrumentation (target=com.abrar.daymark)' \
  | parse_platform_instrumentation_component)"
assert_eq "$component" "com.abrar.daymark.test/com.abrar.daymark.DaymarkPlatformInstrumentation" "registered instrumentation component is parsed from pm output"
missing="$(printf '%s\n' 'package:com.abrar.daymark' 'instrumentation:other.test/OtherRunner (target=other)' | parse_platform_instrumentation_component)"
assert_eq "$missing" "" "unrelated instrumentation entries are ignored"
adb() {
  printf '%s\n' "$*" >> "$ADB_LOG"
  if [ "${ADB_FAIL_STATUS:-0}" -ne 0 ]; then return "$ADB_FAIL_STATUS"; fi
  return 0
}
record_run() { printf 'run\n' >> "$RUN_LOG"; }
: > "$RUN_LOG"; : > "$ADB_LOG"
unset DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT ADB_FAIL_STATUS
run_instrumentation_repeated record_run
assert_eq "$(line_count "$RUN_LOG")" 1 "default executes exactly one instrumentation run"
assert_eq "$(line_count "$ADB_LOG")" 0 "default does not clear app data"
: > "$RUN_LOG"; : > "$ADB_LOG"
DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT=10
export DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT
run_instrumentation_repeated record_run
assert_eq "$(line_count "$RUN_LOG")" 10 "API 36 acceptance executes ten complete runs"
assert_eq "$(line_count "$ADB_LOG")" 9 "only the nine between-run resets are issued"
assert_eq "$(grep -c '^shell pm clear com.abrar.daymark$' "$ADB_LOG")" 9 "resets target only the disposable app package"
: > "$RUN_LOG"; : > "$ADB_LOG"
fail_third() {
  count=$(line_count "$RUN_LOG")
  count=$((count + 1))
  printf '%s\n' "$count" >> "$RUN_LOG"
  [ "$count" -lt 3 ] || return 23
}
if run_instrumentation_repeated fail_third; then
  fail "a failed instrumentation run must stop the sequence"
else
  status=$?
fi
assert_eq "$status" 23 "the first failing run's exit code is preserved"
assert_eq "$(line_count "$RUN_LOG")" 3 "failure is not retried"
assert_eq "$(line_count "$ADB_LOG")" 2 "only resets before the first two attempts occur"
for invalid in 0 11 nope; do
  : > "$RUN_LOG"; : > "$ADB_LOG"
  DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT="$invalid"
  export DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT
  if run_instrumentation_repeated record_run; then
    fail "invalid repeat count '$invalid' must be rejected"
  fi
  assert_eq "$(line_count "$RUN_LOG")" 0 "invalid repeat count does not run instrumentation"
done
: > "$RUN_LOG"; : > "$ADB_LOG"
DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT=3
ADB_FAIL_STATUS=42
export DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT ADB_FAIL_STATUS
if run_instrumentation_repeated record_run; then
  fail "a failed emulator data reset must stop the sequence"
else
  status=$?
fi
assert_eq "$status" 42 "emulator reset failure is propagated"
assert_eq "$(line_count "$RUN_LOG")" 1 "no instrumentation starts after a failed reset"
echo "PASS focus emulator repeat policy: 10-run bound, clean app state, fail-fast, no retries"
