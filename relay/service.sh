#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-}"

# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_supported_platform

case "$ACTION" in
    install|uninstall|status|logs)
        ;;
    *)
        echo "Usage: $0 {install|uninstall|status|logs}"
        exit 2
        ;;
esac

case "$(uname -s)" in
    Darwin)
        label=com.lerdr.service
        if [ ! -f "$HOME/Library/LaunchAgents/$label.plist" ] &&
           [ -f "$HOME/Library/LaunchAgents/com.herdr-mobile-relay.service.plist" ]; then
            label=com.herdr-mobile-relay.service
        fi
        log_dir="$HOME/Library/Logs/lerdr"
        if [ ! -d "$log_dir" ] && [ -d "$HOME/Library/Logs/herdr-mobile-relay" ]; then
            log_dir="$HOME/Library/Logs/herdr-mobile-relay"
        fi
        case "$ACTION" in
            install) exec "$SCRIPT_DIR/install-service.sh" ;;
            uninstall) exec "$SCRIPT_DIR/uninstall-service.sh" ;;
            status) exec launchctl print "gui/$(id -u)/$label" ;;
            logs) exec tail -f "$log_dir/service.log" "$log_dir/service.err" ;;
        esac
        ;;
    Linux)
        unit=lerdr.service
        if [ ! -f "$HOME/.config/systemd/user/$unit" ] &&
           [ -f "$HOME/.config/systemd/user/herdr-mobile-relay.service" ]; then
            unit=herdr-mobile-relay.service
        fi
        case "$ACTION" in
            install) exec "$SCRIPT_DIR/install-systemd-user-service.sh" ;;
            uninstall) exec "$SCRIPT_DIR/uninstall-systemd-user-service.sh" ;;
            status) exec systemctl --user status "$unit" ;;
            logs) exec journalctl --user -u "$unit" -f ;;
        esac
        ;;
esac
