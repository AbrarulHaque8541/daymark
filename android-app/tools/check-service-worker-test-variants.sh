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
for required in "pm list instrumentation" "android.test.InstrumentationTestRunner" "DaymarkServiceWorkerInstrumentation" "DaymarkSWRuntime:I" "runToken" "all Service Worker runtime phases passed" "FAIL after"
do
  if ! printf '%s\n' "$runner" | grep -Fq "$required"; then
    echo "Service Worker runner is missing runtime-result verification: $required" >&2
    exit 1
  fi
done

module_build="$(cat service-worker-test/build.gradle.kts)"
test_source="$(find service-worker-test/src/main/java -name DaymarkServiceWorkerInstrumentation.java -print -quit)"
if [ -z "$test_source" ]; then
  echo "Service Worker JUnit instrumentation test source is missing." >&2
  exit 1
fi
test_source_content="$(cat "$test_source")"
if ! printf '%s\n' "$module_build" | grep -Fq 'testInstrumentationRunner = "android.test.InstrumentationTestRunner"'; then
  echo "Service Worker test module must use the platform JUnit instrumentation runner." >&2
  exit 1
fi
if ! printf '%s\n' "$test_source_content" | grep -Fq "extends InstrumentationTestCase" \
  || ! printf '%s\n' "$test_source_content" | grep -Fq "public void testServiceWorkerNetworkPolicy()" \
  || ! printf '%s\n' "$test_source_content" | grep -Fq 'getString("runToken")'; then
  echo "Service Worker runtime class must expose a discoverable, run-token-bound JUnit3 test." >&2
  exit 1
fi
if printf '%s\n' "$runner" | grep -Fq "adb logcat -c"; then
  echo "Service Worker runner must not depend on clearing logcat buffers." >&2
  exit 1
fi

echo "Both Service Worker target-app flavor tasks and the run-token-bound JUnit runtime test are wired."
