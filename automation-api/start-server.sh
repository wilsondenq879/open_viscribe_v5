#!/bin/sh
# Keep the local-only Automation API credential in Keychain, not in a plist or
# extension bundle. This script is safe to run from launchd or a terminal.
set -eu

REPOSITORY_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
export OPEN_VISCRIBE_API_TOKEN="$(security find-generic-password -a "$(id -un)" -s openviscribe-automation-api-token -w)"

exec /opt/homebrew/bin/node "$REPOSITORY_DIR/automation-api/server.mjs"
