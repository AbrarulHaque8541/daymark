#!/usr/bin/env sh
set -eu

# The com.android.test module's connectedAndroidTest task runs its configured target variants.
./gradlew --no-daemon :service-worker-test:connectedAndroidTest
