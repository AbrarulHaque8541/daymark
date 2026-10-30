#!/usr/bin/env sh
# Host-side smoke test for BrowserLoadWatchdog v2 source contract.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python3 "$ROOT/tools/check-browser-load-watchdog-v2.py" "$ROOT"
echo "PASS run-load-watchdog-tests"
