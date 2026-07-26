#!/bin/sh
# Deploy only the small local API runtime outside macOS's protected Documents
# folder, then register it as the current user's login service.
set -eu

SOURCE_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$HOME/.openviscribe-runtime"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LABEL="com.openviscribe.automation-api"
UID_VALUE="$(id -u)"

mkdir -p "$RUNTIME_DIR/automation-api" "$RUNTIME_DIR/src/data" "$RUNTIME_DIR/.openviscribe-automation" "$LAUNCH_AGENTS_DIR"
cp "$SOURCE_DIR/automation-api/server.mjs" "$RUNTIME_DIR/automation-api/server.mjs"
cp "$SOURCE_DIR/automation-api/mcp-server.mjs" "$RUNTIME_DIR/automation-api/mcp-server.mjs"
cp "$SOURCE_DIR/automation-api/run-codex-mcp.sh" "$RUNTIME_DIR/automation-api/run-codex-mcp.sh"
cp "$SOURCE_DIR/automation-api/start-server.sh" "$RUNTIME_DIR/automation-api/start-server.sh"
cp "$SOURCE_DIR/src/data/hyperframeTemplates.json" "$RUNTIME_DIR/src/data/hyperframeTemplates.json"
cp "$SOURCE_DIR/src/data/hyperframeAssets.json" "$RUNTIME_DIR/src/data/hyperframeAssets.json"
cp "$SOURCE_DIR/automation-api/$LABEL.plist" "$LAUNCH_AGENTS_DIR/$LABEL.plist"

# Keep the runtime's live queue during upgrades. Import a repository state only
# on first installation, otherwise an API restart could resurrect stale tasks.
if [ ! -f "$RUNTIME_DIR/.openviscribe-automation/state.json" ] && [ -f "$SOURCE_DIR/.openviscribe-automation/state.json" ]; then
  cp "$SOURCE_DIR/.openviscribe-automation/state.json" "$RUNTIME_DIR/.openviscribe-automation/state.json"
fi

launchctl print "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1 && launchctl bootout "gui/$UID_VALUE/$LABEL" || true
sleep 1
launchctl bootstrap "gui/$UID_VALUE" "$LAUNCH_AGENTS_DIR/$LABEL.plist"
launchctl kickstart -k "gui/$UID_VALUE/$LABEL"
