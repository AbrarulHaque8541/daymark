#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
javac -cp tools tools/BrowserAddressNoticePanelPolicySmoke.java app/src/main/java/com/abrar/daymark/BrowserAddressNoticePanelPolicy.java
java -cp tools:app/src/main/java com.abrar.daymark.BrowserAddressNoticePanelPolicySmoke
echo PASS run-browser-address-notice-tests
