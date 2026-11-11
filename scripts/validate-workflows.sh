#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ACTIONLINT_VERSION='1.7.12'
readonly ACTIONLINT_ARCHIVE="actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz"
readonly ACTIONLINT_SHA256='8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8'
readonly ACTIONLINT_URL="https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${ACTIONLINT_ARCHIVE}"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
archive="$work_dir/$ACTIONLINT_ARCHIVE"

bash -n "$ROOT/scripts/validate-workflows.sh"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location \
  "$ACTIONLINT_URL" --output "$archive"
printf '%s  %s\n' "$ACTIONLINT_SHA256" "$archive" | sha256sum --check --status

tar -xzf "$archive" -C "$work_dir"
actionlint="$work_dir/actionlint"
test -x "$actionlint"
"$actionlint" -version

mapfile -d '' workflow_files < <(
  find "$ROOT/.github/workflows" -maxdepth 1 -type f \
    \( -name '*.yml' -o -name '*.yaml' \) -print0 | sort -z
)
if (( ${#workflow_files[@]} == 0 )); then
  echo 'No GitHub Actions workflow files were found.' >&2
  exit 1
fi

printf 'Validating %s workflow file(s).\n' "${#workflow_files[@]}"
"$actionlint" -shellcheck= -color -oneline "${workflow_files[@]}"

# This intentionally invalid, non-discoverable fixture proves the pinned
# validator rejects a workflow step that declares both uses and run.
fixture="$ROOT/tests/fixtures/actionlint-invalid.yml"
fixture_log="$work_dir/invalid-fixture.log"
test -s "$fixture"
if "$actionlint" -shellcheck= -oneline "$fixture" >"$fixture_log" 2>&1; then
  echo 'actionlint unexpectedly accepted the deliberately invalid fixture.' >&2
  exit 1
fi
if [[ ! -s "$fixture_log" ]]; then
  echo 'actionlint rejected the fixture without a diagnostic.' >&2
  exit 1
fi
printf 'PASS: actionlint %s rejected the invalid workflow fixture.\n' "$ACTIONLINT_VERSION"
