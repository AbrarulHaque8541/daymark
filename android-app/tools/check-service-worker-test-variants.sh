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
for required in \
  'Starting 1 tests on' \
  'Finished 1 tests on' \
  'DaymarkSWRuntime:I' \
  'runToken' \
  'all Service Worker runtime phases passed' \
  'FAIL after'
do
  if ! printf '%s\n' "$runner" | grep -Fq "$required"; then
    echo "Service Worker runner is missing runtime-result verification: $required" >&2
    exit 1
  fi
done

module_build="$(cat service-worker-test/build.gradle.kts)"
for required in \
  'testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"' \
  'androidx.test:runner:1.6.2' \
  'androidx.test.ext:junit:1.2.1'
do
  if ! printf '%s\n' "$module_build" | grep -Fq "$required"; then
    echo "Service Worker test module is missing required AndroidX instrumentation dependency: $required" >&2
    exit 1
  fi
done

test_keystore="service-worker-test/src/main/assets/daymark_service_worker_test_server.p12"
if ! keystore_info="$(openssl pkcs12 -in "$test_keystore" -passin pass:daymark-test -info -noout 2>&1)"; then
  echo "Service Worker HTTPS test keystore could not be inspected." >&2
  exit 1
fi
for required in \
  'MAC: sha1' \
  'PKCS7 Encrypted data: pbeWithSHA1And3-KeyTripleDES-CBC' \
  'Shrouded Keybag: pbeWithSHA1And3-KeyTripleDES-CBC'
do
  if ! printf '%s\n' "$keystore_info" | grep -Fq "$required"; then
    echo "Service Worker HTTPS test keystore is missing API26-compatible PKCS#12 protection: $required" >&2
    exit 1
  fi
done

test_source="$(find service-worker-test/src/main/java -name DaymarkServiceWorkerInstrumentation.java -print -quit)"
if [ -z "$test_source" ]; then
  echo "Service Worker runtime test source is missing." >&2
  exit 1
fi
test_source_content="$(cat "$test_source")"
for required in \
  '@RunWith(AndroidJUnit4.class)' \
  '@Test' \
  'InstrumentationRegistry.getInstrumentation()' \
  'InstrumentationRegistry.getArguments()' \
  'BrowserWorkspaceController' \
  'enforceOffline.invoke(null, offlinePolicy, Collections.emptyList())'
do
  if ! printf '%s\n' "$test_source_content" | grep -Fq "$required"; then
    echo "Service Worker runtime test is missing a required JUnit/production acceptance contract: $required" >&2
    exit 1
  fi
done

if printf '%s\n' "$runner" | grep -Fq 'adb logcat -c'; then
  echo "Service Worker runner must not depend on clearing logcat buffers." >&2
  exit 1
fi
if printf '%s\n' "$runner" | grep -Fq 'pm list instrumentation'; then
  echo "Service Worker runner must not require the test APK to remain installed after connectedAndroidTest." >&2
  exit 1
fi

echo "Both Service Worker target-app flavors and the AndroidX JUnit runtime acceptance are guarded."
