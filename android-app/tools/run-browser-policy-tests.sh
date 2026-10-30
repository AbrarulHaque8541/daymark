#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python3 "$ROOT/tools/check-browser-http-policy.py" "$ROOT"
echo "PASS run-browser-policy-tests"
