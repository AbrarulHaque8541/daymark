#!/usr/bin/env sh
set -eu

tasks="$(./gradlew --no-daemon :service-worker-test:tasks --all --console=plain)"
for task in \
  connectedGithubSideloadDebugAndroidTest \
  connectedPlayDebugAndroidTest
do
  if ! printf '%s\n' "$tasks" | awk -v expected="$task" '$1 == expected { found = 1 } END { exit !found }'; then
    echo "Required Service Worker instrumentation task is missing: $task" >&2
    exit 1
  fi
done

runner="$(cat tools/run-service-worker-instrumentation-on-emulator.sh)"
for required in "pm list instrumentation" "DaymarkServiceWorkerInstrumentation" "DaymarkSWRuntime:I" "all Service Worker runtime phases passed" "FAIL after"
do
  if ! printf '%s\n' "$runner" | grep -Fq "$required"; then
    echo "Service Worker runner is missing runtime-result verification: $required" >&2
    exit 1
  fi
done
echo "Both Service Worker target-app flavor tasks are registered and runtime-result verification is wired."
