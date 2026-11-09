#!/usr/bin/env sh
set -eu

./gradlew --no-daemon :service-worker-test:connectedGithubSideloadDebugAndroidTest
