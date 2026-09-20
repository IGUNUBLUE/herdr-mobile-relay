#!/bin/bash
set -euo pipefail

# Tailscale Serve transport: publishes the local relay on this machine's
# tailnet HTTPS name and prints the phone setup QR. The tailnet carries the
# traffic end to end — no Cloudflare account, no gateway, no public ingress.
#
#   relay/tailscale-serve.sh [start]   configure serve, verify HTTPS, print QR
#   relay/tailscale-serve.sh off       stop serving the relay on the tailnet
#   relay/tailscale-serve.sh status    show serve config and endpoint health
#   relay/tailscale-serve.sh link      reprint the setup QR without changes
#
# Linux only for now: the phone side works on any Tailscale client, but this
# script has only been exercised against Linux tailscaled.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

ENV_FILE="$(relay_env_file "$SCRIPT_DIR")"
PORT="${LERDR_RELAY_PORT:-${HERDR_RELAY_PORT:-8375}}"
COMMAND="${1:-start}"

if [ "$(uname -s)" != "Linux" ]; then
    echo "✗ The Tailscale transport currently supports Linux only."
    exit 1
fi

if ! command -v tailscale >/dev/null 2>&1; then
    echo "✗ tailscale is not installed."
    echo "  Install it and sign this machine into your tailnet: https://tailscale.com/download"
    exit 1
fi

# This node's MagicDNS name (e.g. host.tail1234.ts.net), without the trailing
# dot. Empty when tailscaled is down, logged out, or MagicDNS is off.
tailscale_fqdn() {
    local status_json fqdn

    if ! status_json="$(tailscale status --json 2>/dev/null)"; then
        echo "✗ tailscale status failed — is tailscaled running and this machine logged in?" >&2
        return 1
    fi
    if command -v python3 >/dev/null 2>&1; then
        fqdn="$(printf '%s' "$status_json" |
            python3 -c 'import json,sys; print(json.load(sys.stdin).get("Self",{}).get("DNSName","").rstrip("."))' \
                2>/dev/null)"
    else
        # Self serializes before Peer entries, so the first DNSName is ours.
        fqdn="$(printf '%s' "$status_json" | sed -n 's/.*"DNSName":"\([^"]*\)".*/\1/p' | head -1)"
        fqdn="${fqdn%.}"
    fi
    if [ -z "$fqdn" ]; then
        echo "✗ This node has no tailnet DNS name." >&2
        echo "  Enable MagicDNS in the tailnet admin: https://login.tailscale.com/admin/dns" >&2
        return 1
    fi
    printf '%s\n' "$fqdn"
}

# The serve config already forwards tailnet HTTPS to this relay port.
serve_proxies_relay() {
    tailscale serve status 2>/dev/null |
        grep -qE "proxy https?://(127\.0\.0\.1|localhost):$PORT([/:[:space:]]|$)"
}

configure_serve() {
    local output

    # tailscale serve blocks while the node lacks Serve/HTTPS-cert approval,
    # printing a one-time enable URL first; that wait is the intended flow.
    if ! output="$(tailscale serve --bg --yes "$PORT" 2>&1)"; then
        printf '%s\n' "$output" >&2
        if printf '%s' "$output" | grep -q "Serve is not enabled"; then
            echo "" >&2
            echo "  Also required once per tailnet: HTTPS Certificates at" >&2
            echo "  https://login.tailscale.com/admin/dns" >&2
        fi
        return 1
    fi
    printf '%s\n' "$output"
}

# The first HTTPS request triggers tailnet certificate provisioning, which can
# take several seconds; retry rather than report a dead endpoint.
wait_for_https() {
    local fqdn="$1"
    local attempt

    for attempt in $(seq 1 30); do
        if curl -fsS --max-time 5 "https://$fqdn/healthz" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# setup-link.sh needs the verified release; a source checkout can satisfy the
# same requirement by pointing LERDR_RELAY_BIN at its own build. Surface that
# as a hint instead of letting the generic release error stand alone.
require_relay_binary() {
    if relay_binary >/dev/null 2>&1; then
        return 0
    fi
    local repo_bin="$SCRIPT_DIR/../bin/lerdr"
    echo "✗ Verified relay release is unavailable." >&2
    if [ -x "$repo_bin" ]; then
        echo "  This checkout has a built binary; point the launcher at it:" >&2
        echo "  LERDR_RELAY_BIN=bin/lerdr make tailscale-setup" >&2
    else
        echo "  Install the plugin release, or build one:" >&2
        echo "  go build -o bin/lerdr ./cmd/lerdr" >&2
    fi
    return 1
}

print_setup_link() {
    local fqdn="$1"

    LERDR_PHONE_APP_URL="https://$fqdn" "$SCRIPT_DIR/setup-link.sh" "$fqdn"
}

case "$COMMAND" in
    start)
        FQDN="$(tailscale_fqdn)"
        if serve_proxies_relay; then
            echo "▸ Tailscale Serve already proxies tailnet HTTPS to 127.0.0.1:$PORT"
        elif tailscale serve status 2>/dev/null | grep -q .; then
            echo "✗ tailscale serve is already configured for a different target:"
            tailscale serve status
            echo ""
            echo "  Refusing to replace it. Free the tailnet listener first:"
            echo "  relay/tailscale-serve.sh off    (or: tailscale serve --https=443 off)"
            exit 1
        else
            echo "▸ Exposing 127.0.0.1:$PORT as https://$FQDN inside the tailnet..."
            configure_serve
        fi

        if ! curl -fsS --max-time 3 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
            echo "▸ The relay is not answering on 127.0.0.1:$PORT yet."
            echo "  Start it first (quick start or the background service), then rerun"
            echo "  this command for the HTTPS check and a freshly armed QR."
        elif ! wait_for_https "$FQDN"; then
            echo "✗ https://$FQDN did not become healthy within 30s."
            echo "  Inspect with: tailscale serve status"
            exit 1
        else
            echo "▸ Tailnet endpoint healthy: https://$FQDN"
        fi
        echo ""
        require_relay_binary
        print_setup_link "$FQDN"
        ;;
    link)
        FQDN="$(tailscale_fqdn)"
        if ! serve_proxies_relay; then
            echo "✗ Tailscale Serve is not forwarding to the relay; run: relay/tailscale-serve.sh start"
            exit 1
        fi
        require_relay_binary
        print_setup_link "$FQDN"
        ;;
    off)
        if ! tailscale serve status 2>/dev/null | grep -q .; then
            echo "Tailscale Serve has no configuration; nothing to stop."
            exit 0
        fi
        tailscale serve status
        echo ""
        tailscale serve --https=443 off
        echo "Stopped serving on the tailnet. The relay itself is untouched."
        ;;
    status)
        FQDN="$(tailscale_fqdn)"
        echo "Tailnet name: $FQDN"
        echo ""
        if ! tailscale serve status 2>/dev/null | grep -q .; then
            echo "Tailscale Serve: no configuration (run relay/tailscale-serve.sh start)"
        else
            echo "Tailscale Serve:"
            tailscale serve status
            echo ""
            if curl -fsS --max-time 5 "https://$FQDN/healthz" >/dev/null 2>&1; then
                echo "Endpoint: https://$FQDN healthy"
            else
                echo "Endpoint: https://$FQDN not answering"
            fi
        fi
        ;;
    *)
        echo "Usage: $0 [start|off|status|link]"
        exit 2
        ;;
esac
