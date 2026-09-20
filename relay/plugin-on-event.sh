#!/bin/sh
# Herdr event hook: a bounded local UDP send from the packaged Go helper.
set -eu

RELEASE_ROOT=${LERDR_RELEASE_ROOT:-${HERDR_RELEASE_ROOT:-"${XDG_DATA_HOME:-$HOME/.local/share}/lerdr"}}
RELAY_BIN=${LERDR_RELAY_BIN:-${HERDR_RELAY_BIN:-"$RELEASE_ROOT/current/lerdr"}}
if [ ! -x "$RELAY_BIN" ] && [ -x "$RELEASE_ROOT/current/herdr-mobile-relay" ]; then
    RELAY_BIN="$RELEASE_ROOT/current/herdr-mobile-relay"
fi
if [ ! -x "$RELAY_BIN" ]; then
    LEGACY_RELEASE_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/herdr-mobile-relay"
    if [ -x "$LEGACY_RELEASE_ROOT/current/herdr-mobile-relay" ]; then
        RELAY_BIN="$LEGACY_RELEASE_ROOT/current/herdr-mobile-relay"
    fi
fi
if [ ! -x "$RELAY_BIN" ]; then
    echo "lerdr: verified relay release is unavailable: $RELAY_BIN" >&2
    exit 1
fi
exec "$RELAY_BIN" event-hook
