#!/bin/sh
# Host-side smoke for BrowserDownloadFailClosedPolicy.
set -eu
cd "$(dirname "$0")/.."
javac -cp app/src/main/java app/src/main/java/com/abrar/daymark/BrowserDownloadFailClosedPolicy.java \
  tools/BrowserDownloadFailClosedPolicySmoke.java
java -cp app/src/main/java:tools BrowserDownloadFailClosedPolicySmoke
