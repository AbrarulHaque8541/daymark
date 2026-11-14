#!/usr/bin/env sh
# Repeat a complete Android instrumentation command without retrying failures.
# The emulator is disposable: clear only the app package between independent runs.
# Parse the instrumentation component from pm output without depending on
# an unescaped sed BRE group or the order of unrelated package-manager lines.
parse_platform_instrumentation_component() {
  awk '/^instrumentation:/ && /DaymarkPlatformInstrumentation/ {
    sub(/^instrumentation:/, "")
    sub(/ .*/, "")
    print
    exit
  }'
}

run_instrumentation_repeated() {
  if [ "$#" -eq 0 ]; then
    echo "instrumentation command is required" >&2
    return 2
  fi
  repeat_count="${DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT:-1}"
  case "$repeat_count" in
    1|2|3|4|5|6|7|8|9|10) ;;
    *)
      echo "DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT must be an integer from 1 through 10" >&2
      return 2
      ;;
  esac
  iteration=1
  while [ "$iteration" -le "$repeat_count" ]; do
    if [ "$iteration" -gt 1 ]; then
      if adb shell pm clear com.abrar.daymark >/dev/null; then
        :
      else
        reset_status=$?
        echo "Could not reset the disposable emulator app data before run $iteration/$repeat_count" >&2
        return "$reset_status"
      fi
    fi
    echo "Focus lifecycle instrumentation run $iteration/$repeat_count"
    if "$@"; then
      echo "Focus lifecycle instrumentation run $iteration/$repeat_count PASS"
    else
      run_status=$?
      echo "Focus lifecycle instrumentation stopped at run $iteration/$repeat_count (exit $run_status); no retry was attempted" >&2
      return "$run_status"
    fi
    iteration=$((iteration + 1))
  done
}
