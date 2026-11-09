#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$ROOT/tools/platform-instrumentation-input-bridge.sh"
TMP=$(mktemp -d "daymark-input-bridge.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
mkdir -p "$TMP/bin" "$TMP/device"
cat > "$TMP/bin/adb" <<'EOF'
#!/usr/bin/env sh
set -eu
if [ "$1" = shell ] && [ "$2" = run-as ] && [ "$4" = cat ]; then
  count=0
  [ -f "$FAKE_READ_COUNT" ] && count=$(cat "$FAKE_READ_COUNT")
  count=$((count + 1))
  printf '%s\n' "$count" > "$FAKE_READ_COUNT"
  cat "$FAKE_DEVICE_DIR/instrumentation-input-request.txt"
  if [ "${FAKE_STOP_AFTER_READS:-0}" -gt 0 ] && [ "$count" -ge "$FAKE_STOP_AFTER_READS" ]; then
    touch "$FAKE_STOP_FILE"
  fi
  exit 0
fi
if [ "$1" = shell ] && [ "$2" = input ]; then
  printf '%s\n' "$*" >> "$FAKE_INPUT_LOG"
  exit "${FAKE_INPUT_STATUS:-0}"
fi
if [ "$1" = shell ] && [ "$2" = run-as ] && [ "$4" = sh ] && [ "$5" = -c ]; then
  printf '%s|%s\n' "$8" "$9" > "$FAKE_DEVICE_DIR/instrumentation-input-result.txt"
  if [ "${FAKE_STOP_AFTER_READS:-0}" -eq 0 ]; then
    touch "$FAKE_STOP_FILE"
  fi
  exit 0
fi
echo "unexpected fake adb arguments: $*" >&2
exit 90
EOF
chmod +x "$TMP/bin/adb"
export PATH="$TMP/bin:$PATH"
export FAKE_DEVICE_DIR="$TMP/device"
export FAKE_INPUT_LOG="$TMP/input.log"
export FAKE_STOP_FILE="$TMP/stop"
export FAKE_READ_COUNT="$TMP/read-count"
fail() { echo "FAIL: $*" >&2; exit 1; }
run_case() {
  request="$1"
  expected_input="$2"
  expected_result="$3"
  : > "$FAKE_INPUT_LOG"
  rm -f "$FAKE_STOP_FILE" "$FAKE_READ_COUNT" "$FAKE_DEVICE_DIR/instrumentation-input-result.txt"
  printf '%s\n' "$request" > "$FAKE_DEVICE_DIR/instrumentation-input-request.txt"
  FAKE_STOP_AFTER_READS=0
  export FAKE_STOP_AFTER_READS
  drive_instrumentation_input_bridge com.abrar.daymark "$FAKE_STOP_FILE"
  if [ -n "$expected_input" ]; then
    grep -Fqx "$expected_input" "$FAKE_INPUT_LOG" || fail "expected host input '$expected_input'"
  else
    [ ! -s "$FAKE_INPUT_LOG" ] || fail "invalid request must not invoke adb input"
  fi
  grep -Fqx "$expected_result" "$FAKE_DEVICE_DIR/instrumentation-input-result.txt" \
    || fail "expected result '$expected_result'"
}
run_case "1|tap|12|34|12|34|100" "shell input tap 12 34" "1|0"
run_case "2|swipe|10|20|30|40|360" "shell input swipe 10 20 30 40 360" "2|0"
run_case "3|delete|10|20|30|40|360" "" "3|2"
: > "$FAKE_INPUT_LOG"
rm -f "$FAKE_STOP_FILE" "$FAKE_READ_COUNT" "$FAKE_DEVICE_DIR/instrumentation-input-result.txt"
printf '%s\n' "4|swipe|1|2|3|4|360" > "$FAKE_DEVICE_DIR/instrumentation-input-request.txt"
FAKE_INPUT_STATUS=7
FAKE_STOP_AFTER_READS=0
export FAKE_INPUT_STATUS FAKE_STOP_AFTER_READS
drive_instrumentation_input_bridge com.abrar.daymark "$FAKE_STOP_FILE"
grep -Fqx "4|7" "$FAKE_DEVICE_DIR/instrumentation-input-result.txt" \
  || fail "host input failure status must reach instrumentation"
: > "$FAKE_INPUT_LOG"
rm -f "$FAKE_STOP_FILE" "$FAKE_READ_COUNT" "$FAKE_DEVICE_DIR/instrumentation-input-result.txt"
printf '%s\n' "5|tap|12|34|12|34|100" > "$FAKE_DEVICE_DIR/instrumentation-input-request.txt"
unset FAKE_INPUT_STATUS
FAKE_STOP_AFTER_READS=2
export FAKE_STOP_AFTER_READS
drive_instrumentation_input_bridge com.abrar.daymark "$FAKE_STOP_FILE"
[ "$(wc -l < "$FAKE_INPUT_LOG" | tr -d '[:space:]')" = "1" ] \
  || fail "a repeated request sequence must be dispatched only once"

: > "$FAKE_INPUT_LOG"
rm -f "$FAKE_STOP_FILE" "$FAKE_READ_COUNT" "$FAKE_DEVICE_DIR/instrumentation-input-result.txt"
printf '%s\\n' "6|tap|12|34|12|34|100" > "$FAKE_DEVICE_DIR/instrumentation-input-request.txt"
FAKE_STOP_AFTER_READS=0
FAKE_PUBLISH_STATUS=9
export FAKE_STOP_AFTER_READS FAKE_PUBLISH_STATUS
set +e
publish_error="$(drive_instrumentation_input_bridge com.abrar.daymark "$FAKE_STOP_FILE" 2>&1)"
publish_status=$?
set -e
[ "$publish_status" -ne 0 ] || fail "a failed result publication must stop the bridge"
printf '%s\\n' "$publish_error" | grep -Fq "fake result publish denied" \\
  || fail "the bridge must surface the adb result-publication error"
unset FAKE_PUBLISH_STATUS

echo "PASS host input bridge protocol: tap/swipe routing, invalid-action rejection, failure propagation, duplicate suppression"
