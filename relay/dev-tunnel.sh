#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_DIR="${LERDR_DEV_CONFIG_DIR:-${HERDR_DEV_CONFIG_DIR:-$SCRIPT_DIR/.dev}}"
DEV_BIN_DIR="$DEV_DIR/bin"

mkdir -p "$DEV_DIR" "$DEV_BIN_DIR"
chmod 700 "$DEV_DIR"

unset HERDR_PLUGIN_CONFIG_DIR
export LERDR_DEV_TUNNEL=1
# Both env spellings are exported so the child relay reads its configuration
# under whichever prefix its generation understands.
export LERDR_RELAY_ENV="${LERDR_DEV_RELAY_ENV:-${HERDR_DEV_RELAY_ENV:-$DEV_DIR/relay.env}}"
export HERDR_RELAY_ENV="$LERDR_RELAY_ENV"
export LERDR_RELAY_HOST="127.0.0.1"
export HERDR_RELAY_HOST="$LERDR_RELAY_HOST"
export LERDR_RELAY_PORT="${LERDR_DEV_RELAY_PORT:-${HERDR_DEV_RELAY_PORT:-18375}}"
export HERDR_RELAY_PORT="$LERDR_RELAY_PORT"
export LERDR_RELAY_PLUGIN_PORT="${LERDR_DEV_PLUGIN_PORT:-${HERDR_DEV_PLUGIN_PORT:-18376}}"
export HERDR_RELAY_PLUGIN_PORT="$LERDR_RELAY_PLUGIN_PORT"
export LERDR_WEB_ROOT="$REPO_DIR/frontend/dist"
if [ -z "${LERDR_RELAY_BIN:-${HERDR_RELAY_BIN:-}}" ]; then
    "$REPO_DIR/scripts/build.sh" "$DEV_BIN_DIR"
    export LERDR_RELAY_BIN="$DEV_BIN_DIR/lerdr"
fi

echo "🐑 Lerdr development tunnel"
echo ""
echo "  Config:      $LERDR_RELAY_ENV"
echo "  Relay:       http://127.0.0.1:$LERDR_RELAY_PORT"
echo "  Plugin UDP:  127.0.0.1:$LERDR_RELAY_PLUGIN_PORT"
echo "  Web root:    $LERDR_WEB_ROOT"
echo "  Binary:      ${LERDR_RELAY_BIN:-$HERDR_RELAY_BIN}"
echo "  Production relay port 8375 and its configuration are not used."
echo ""

if ! command -v bun >/dev/null 2>&1; then
    echo "✗ bun is required for make dev-tunnel. Install Bun 1.4 first." >&2
    exit 1
fi

bun run --cwd "$REPO_DIR/frontend" build
"$SCRIPT_DIR/setup.sh" --install-missing
exec "$SCRIPT_DIR/start.sh"
