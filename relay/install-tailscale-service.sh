#!/bin/bash
set -euo pipefail

# Installs the relay as a systemd user service for the Tailscale transport.
# Unlike the Cloudflare variant there is no tunnel process to supervise:
# tailscaled owns the tailnet listener and persists the serve configuration,
# so this unit runs only the relay.

LABEL="herdr-mobile-relay.service"
LEGACY_LABEL="herdr-remote.service"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/$LABEL"
LEGACY_UNIT_FILE="$UNIT_DIR/$LEGACY_LABEL"

export PATH="$HOME/.local/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

ENV_FILE="$(relay_env_file "$SCRIPT_DIR")"
PORT="${HERDR_RELAY_PORT:-8375}"

if [ "$(uname -s)" != "Linux" ]; then
    echo "The Tailscale transport currently supports Linux only."
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemctl not found"
    exit 1
fi

RELAY_BIN="$(relay_binary)"
ensure_relay_env "$ENV_FILE"

RELEASE_ROOT="$(relay_release_root)"
WORK_DIR="$RELEASE_ROOT/current"
if [ ! -d "$WORK_DIR" ]; then
    WORK_DIR="$SCRIPT_DIR/.."
fi
# systemd rejects non-normalized paths such as ".../relay/..".
WORK_DIR="$(cd "$WORK_DIR" && pwd -P)"

# The service PATH is static, so mirror the foreground wrapper's per-agent bin
# discovery at install time; new agents installed later can be added through
# HERDR_BIN or an explicit Environment edit in the unit.
SERVICE_PATH="/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
for agent_bin in "$HOME"/.[!.]*/bin; do
    [ -d "$agent_bin" ] && SERVICE_PATH="$SERVICE_PATH:$agent_bin"
done

mkdir -p "$UNIT_DIR"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Herdr Mobile Relay (Tailscale transport)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$WORK_DIR
Environment=HERDR_RELAY_ENV=$ENV_FILE
# The binary uses HERDR_RELAY_ENV only to locate its runtime directory; the
# relay key itself must come from the env file, like the foreground wrappers
# source it before exec. EnvironmentFile is the systemd-native equivalent.
EnvironmentFile=$ENV_FILE
Environment=HERDR_RELAY_HOST=127.0.0.1
Environment=HERDR_RELAY_PORT=$PORT
Environment=PATH=$SERVICE_PATH
ExecStart=$RELAY_BIN serve
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user disable --now "$LEGACY_LABEL" >/dev/null 2>&1 || true
rm -f "$LEGACY_UNIT_FILE"
systemctl --user daemon-reload
systemctl --user enable "$LABEL"
systemctl --user restart "$LABEL"

echo "Installed and started $LABEL"
echo "Unit: $UNIT_FILE"
echo "Env:  $ENV_FILE"
echo "Logs: journalctl --user -u $LABEL -f"

echo "Waiting for relay health on 127.0.0.1:$PORT..."
if ! HEALTH="$(wait_for_relay_health "$PORT")"; then
    echo "Relay service was installed, but it did not become healthy."
    echo "Inspect it with:"
    echo "  systemctl --user status $LABEL --no-pager"
    echo "  journalctl --user -u $LABEL -n 80 --no-pager"
    exit 1
fi
echo "Relay health: $HEALTH"
echo ""
echo "Publish it on the tailnet and print the phone QR with:"
echo "  relay/tailscale-serve.sh start"
