#!/usr/bin/env sh
# Host-side input bridge for instrumentation tests. Android 15+ restricts
# Instrumentation.sendPointerSync when the test APK and target app have
# different UIDs, so the emulator host performs the real touchscreen action.
drive_instrumentation_input_bridge() {
  package="$1"
  stop_file="$2"
  last_seq=""
  while [ ! -f "$stop_file" ]; do
    request="$(adb shell run-as "$package" cat files/daymark-instrumentation-input-request.txt 2>/dev/null | tr -d '\r' || true)"
    if [ -n "$request" ]; then
      seq=""
      action=""
      x1=""
      y1=""
      x2=""
      y2=""
      duration=""
      IFS='|' read -r seq action x1 y1 x2 y2 duration <<EOF
$request
EOF
      case "$seq" in ''|*[!0-9]*) seq="" ;; esac
      if [ -n "$seq" ] && [ "$seq" != "$last_seq" ]; then
        invalid=0
        for value in "$x1" "$y1" "$x2" "$y2" "$duration"; do
          case "$value" in ''|*[!0-9]*) invalid=1 ;; esac
        done
        if [ "$invalid" -eq 0 ]; then
          if [ "$x1" -gt 10000 ] || [ "$y1" -gt 10000 ] \
             || [ "$x2" -gt 10000 ] || [ "$y2" -gt 10000 ] \
             || [ "$duration" -lt 1 ] || [ "$duration" -gt 2000 ]; then
            invalid=1
          fi
        fi
        if [ "$invalid" -ne 0 ]; then
          input_status=2
        else
          case "$action" in
            tap)
              set +e
              adb shell input tap "$x1" "$y1" >/dev/null 2>&1
              input_status=$?
              set -e
              ;;
            swipe)
              set +e
              adb shell input swipe "$x1" "$y1" "$x2" "$y2" "$duration" >/dev/null 2>&1
              input_status=$?
              set -e
              ;;
            *)
              input_status=2
              ;;
          esac
        fi
        if ! adb shell run-as "$package" sh -c \
          'printf "%s|%s\n" "$1" "$2" > files/daymark-instrumentation-input-result.tmp && mv files/daymark-instrumentation-input-result.tmp files/daymark-instrumentation-input-result.txt' \
          sh "$seq" "$input_status" >/dev/null 2>&1; then
          echo "Could not publish host input result for sequence $seq" >&2
          return 1
        fi
        last_seq="$seq"
      fi
    fi
    sleep 0.05
  done
}
