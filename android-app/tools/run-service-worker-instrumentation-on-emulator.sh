#!/usr/bin/env sh
set -eu

# Run both target-app distribution variants explicitly; the aggregate task
# cannot disambiguate the two tested APKs in this multi-flavor project.
./gradlew --no-daemon \
  :service-worker-test:connectedGithubSideloadDebugAndroidTest \
  :service-worker-test:connectedPlayDebugAndroidTest
