#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
python3 ./tools/check-package-cleanliness.py "$ROOT/.."
sh ./tools/run-core-tests.sh
python3 ./tools/check-ui-motion-wiring.py "$ROOT"
sh ./tools/run-browser-address-notice-tests.sh
python3 ./tools/check-browser-address-notice-integration.py
sh ./tools/run-activity-request-code-tests.sh
sh ./tools/run-portable-export-tests.sh
sh ./tools/run-window-insets-tests.sh
sh ./tools/run-attachment-tests.sh
sh ./tools/run-portable-backup-tests.sh
sh ./tools/run-portable-staging-tests.sh
sh ./tools/run-updater-picker-routing-tests.sh
sh ./tools/run-diagnostics-tests.sh
sh ./tools/run-web-mode-tests.sh
sh ./tools/run-text-scale-tests.sh
sh ./tools/run-check-guard-tests.sh
python3 ./tools/check-attachment-source.py "$ROOT"
python3 ./tools/check-browser-catalog.py "$ROOT"
python3 ./tools/check-browser-load-watchdog.py "$ROOT"
sh ./tools/run-load-watchdog-tests.sh
sh ./tools/run-browser-download-tracker-tests.sh
python3 ./tools/check-browser-session-lifecycle.py "$ROOT"
python3 ./tools/check-browser-error-diagnostics.py "$ROOT"
python3 ./tools/check-cold-start-recovery.py "$ROOT"
python3 ./tools/check-extension-trust-confirmation.py "$ROOT"
python3 ./tools/check-browser-image-policy.py "$ROOT"
python3 ./tools/check-extension-import-hardening.py "$ROOT"
python3 ./tools/check-browser-tab-settings.py "$ROOT"
python3 ./tools/check-browser-downloads.py "$ROOT"
python3 ./tools/check-reminder-lifecycle.py "$ROOT"
python3 ./tools/check-reader-mode.py "$ROOT"
python3 ./tools/check-web-clip.py "$ROOT"
python3 ./tools/check-find-in-page.py "$ROOT"
python3 ./tools/check-browser-downloads-entry.py "$ROOT"
python3 ./tools/check-browser-downloads-shortcut.py "$ROOT"
python3 ./tools/check-bottom-navigation.py "$ROOT"
python3 ./tools/check-press-feedback.py "$ROOT"
python3 ./tools/check-task-ux.py "$ROOT"
python3 ./tools/check-task-webhook.py "$ROOT"
python3 ./tools/check-github-public-issues.py "$ROOT"
python3 ./tools/check-integration-catalog-panel.py "$ROOT"
python3 ./tools/check-browser-intent-links.py "$ROOT"
sh ./tools/run-browser-app-link-approval-tests.sh
python3 ./tools/check-browser-app-link-approval.py "$ROOT"
python3 ./tools/check-oauth-pkce.py "$ROOT"
python3 ./tools/check-calendar-handoff.py "$ROOT"
python3 ./tools/check-oauth-token-vault.py "$ROOT"
