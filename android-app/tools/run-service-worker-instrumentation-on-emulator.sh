#!/usr/bin/env sh
set -eu

./gradlew --no-daemon installGithubSideloadDebug installGithubSideloadDebugAndroidTest

instrumentation="$(adb shell pm list instrumentation | tr -d '\r' \
  | sed -n 's/^instrumentation:\([^ ]*DaymarkServiceWorkerInstrumentation\).*/\1/p' \
  | head -n 1)"
if [ -z "$instrumentation" ]; then
  echo "DaymarkServiceWorkerInstrumentation was not registered in the test APK manifest." >&2
  adb shell pm list instrumentation >&2
  exit 1
fi

echo "Running controlled Service Worker request-trace component: $instrumentation"
output="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/daymark-service-worker-instrumentation.log"
set +e
timeout --signal=TERM --kill-after=10s 300s adb shell am instrument -w -r "$instrumentation" >"$output" 2>&1
status=$?
set -e
cat "$output"
if [ "$status" -ne 0 ] \
   || ! grep -Fq 'INSTRUMENTATION_RESULT: service_worker_runtime=passed' "$output"; then
  adb logcat -d -s DaymarkSWRuntime:I DaymarkServiceWorker:E System.err:E | tail -n 100 || true
  exit 1
fi
