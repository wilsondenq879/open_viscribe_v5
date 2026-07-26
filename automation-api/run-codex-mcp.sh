#!/bin/sh
# The token stays in macOS Keychain rather than in Codex's MCP configuration.
set -eu

OPEN_VISCRIBE_API_URL="${OPEN_VISCRIBE_API_URL:-http://127.0.0.1:4318}"
OPEN_VISCRIBE_API_TOKEN="$(security find-generic-password -a "$(id -un)" -s openviscribe-automation-api-token -w)"
export OPEN_VISCRIBE_API_URL OPEN_VISCRIBE_API_TOKEN

exec node "$(dirname "$0")/mcp-server.mjs"
