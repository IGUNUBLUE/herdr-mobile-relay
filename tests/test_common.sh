#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lerdr-common-test.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

# shellcheck source=../relay/common.sh
. "$REPO_DIR/relay/common.sh"

id() {
    if [ "${1:-}" = "-u" ]; then
        printf '0\n'
        return
    fi
    command id "$@"
}
if require_user_service_context >/dev/null 2>&1; then
    echo "user service management unexpectedly accepted root" >&2
    exit 1
fi
unset -f id

DEV_RELAY_BIN="$WORK_DIR/dev/lerdr"
mkdir -p "$(dirname "$DEV_RELAY_BIN")"
printf '#!/bin/sh\nexit 0\n' > "$DEV_RELAY_BIN"
chmod 700 "$DEV_RELAY_BIN"
test "$(LERDR_RELAY_BIN="$DEV_RELAY_BIN" relay_binary)" = "$DEV_RELAY_BIN"

PACKAGED_RELEASE="$WORK_DIR/releases/0.0.0-test"
mkdir -p "$PACKAGED_RELEASE/relay"
cp "$REPO_DIR/relay/common.sh" "$PACKAGED_RELEASE/relay/common.sh"
printf '{}\n' > "$PACKAGED_RELEASE/release-manifest.json"
printf '#!/bin/sh\nexit 0\n' > "$PACKAGED_RELEASE/lerdr"
chmod 700 "$PACKAGED_RELEASE/lerdr"
PACKAGED_BINARY="$(
    LERDR_RELAY_BIN="$DEV_RELAY_BIN" \
        bash -c '. "$1"; relay_binary' _ "$PACKAGED_RELEASE/relay/common.sh"
)"
PACKAGED_RELEASE_REAL="$(cd "$PACKAGED_RELEASE" && pwd -P)"
test "$PACKAGED_BINARY" = "$PACKAGED_RELEASE_REAL/lerdr"

# A plugin checkout installs the release of the repository it was cloned from,
# in whichever URL form git recorded, and nothing else may pass for one.
CHECKOUT="$WORK_DIR/checkout"
git init -q "$CHECKOUT"
for REMOTE_URL in \
    "git@github.com:0cv/lerdr-dev.git" \
    "https://github.com/0cv/lerdr-dev.git" \
    "https://github.com/0cv/lerdr-dev" \
    "ssh://git@github.com/0cv/lerdr-dev.git"; do
    git -C "$CHECKOUT" remote remove origin 2>/dev/null || true
    git -C "$CHECKOUT" remote add origin "$REMOTE_URL"
    test "$(release_repository "$CHECKOUT")" = "0cv/lerdr-dev"
done
for REJECTED_URL in \
    "https://gitlab.com/0cv/lerdr-dev.git" \
    "https://github.com/0cv/lerdr-dev/extra" \
    "https://github.com/0cv"; do
    git -C "$CHECKOUT" remote remove origin
    git -C "$CHECKOUT" remote add origin "$REJECTED_URL"
    if release_repository "$CHECKOUT" >/dev/null 2>&1; then
        echo "release repository accepted '$REJECTED_URL'" >&2
        exit 1
    fi
done
git -C "$CHECKOUT" remote remove origin
if release_repository "$CHECKOUT" >/dev/null 2>&1; then
    echo "release repository resolved a checkout without an origin" >&2
    exit 1
fi


# Titles are bold on a terminal only. A pipe is not one, so logs, tests, and
# non-terminal panes keep the plain text they parse, and NO_COLOR is honoured
# even when a terminal is present.
test "$(NO_COLOR= menu_item 3 "Stable Tunnel")" = "  3. Stable Tunnel"
test "$(NO_COLOR=1 menu_item q "Exit, change nothing")" = "  q. Exit, change nothing"

# Use the same origin contract as the packaged binary without depending on an
# installed release.
PHONE_SETUP_NORMALIZER="$WORK_DIR/phone-setup-normalizer"
cat > "$PHONE_SETUP_NORMALIZER" <<'EOF'
#!/bin/sh
test "$1 $2" = "normalize-origin --allow-loopback-http" || exit 2
case "$3" in
    'https://app.example.test ') printf '%s\n' 'https://app.example.test' ;;
    https://app.example.test | http://127.0.0.1:8375) printf '%s\n' "$3" ;;
    *) exit 1 ;;
esac
EOF
chmod 700 "$PHONE_SETUP_NORMALIZER"

PHONE_SETUP_URL='https://app.example.test/#setup=relay%3A%2F%2Fmachine.example.test%3A443%3Ftoken%3Dfixture-private-token-0123456789abcdef'
run_phone_setup_helper() (
    relay_binary() { printf '%s\n' "$PHONE_SETUP_NORMALIZER"; }
    render_setup_qr() {
        [ "${PHONE_SETUP_RENDER_BAD_QR:-}" != 1 ] ||
            printf 'attacker-controlled QR\n'
    }
    stdout_is_terminal() { [ "${PHONE_SETUP_TTY:-}" = 1 ]; }
    unset NO_COLOR
    [ "${PHONE_SETUP_NO_COLOR:-}" != 1 ] || NO_COLOR=1
    "$@"
)

PHONE_SETUP_PLAIN_EXPECTED="$(
    printf '  Open this private setup link on your phone:\n  %s\n' "$PHONE_SETUP_URL"
)"
PHONE_SETUP_LINK_EXPECTED="$(
    printf '  Open this private setup link on your phone:\n'
    printf '  \033]8;;%s\033\\%s\033]8;;\033\\\n' "$PHONE_SETUP_URL" "$PHONE_SETUP_URL"
)"

# Redirects stay plain. Interactive terminals receive the vendor-neutral OSC 8
# protocol; explicit plain-output requests still win.
test "$(run_phone_setup_helper print_phone_setup "$PHONE_SETUP_URL")" = \
    "$PHONE_SETUP_PLAIN_EXPECTED"
test "$(
    PHONE_SETUP_TTY=1 TERM=xterm-256color \
        run_phone_setup_helper print_phone_setup "$PHONE_SETUP_URL"
)" = "$PHONE_SETUP_LINK_EXPECTED"
test "$(
    PHONE_SETUP_TTY=1 PHONE_SETUP_NO_COLOR=1 TERM=xterm-256color \
        run_phone_setup_helper print_phone_setup "$PHONE_SETUP_URL"
)" = "$PHONE_SETUP_PLAIN_EXPECTED"
test "$(
    PHONE_SETUP_TTY=1 TERM=dumb \
        run_phone_setup_helper print_phone_setup "$PHONE_SETUP_URL"
)" = "$PHONE_SETUP_PLAIN_EXPECTED"

run_phone_setup_helper phone_setup_url_is_safe \
    'http://127.0.0.1:8375/#setup=fixture'
for REJECTED_PHONE_SETUP_URL in \
    "${PHONE_SETUP_URL}"$'\a''bell' \
    "${PHONE_SETUP_URL}"$'\033\\''escape' \
    "${PHONE_SETUP_URL}"$'\n''line' \
    'https://app.example.test /#setup=fixture' \
    'javascript:alert(1)' \
    'http://example.test/#setup=fixture'; do
    if run_phone_setup_helper phone_setup_url_is_safe \
        "$REJECTED_PHONE_SETUP_URL"; then
        echo "setup URL validator accepted an unsafe value" >&2
        exit 1
    fi
done
unset REJECTED_PHONE_SETUP_URL

# Rejection happens before either the QR or terminal sink writes.
PHONE_SETUP_ACTUAL="$WORK_DIR/phone-setup-rejected"
PHONE_SETUP_UNSAFE="${PHONE_SETUP_URL}"$'\033\\''escape'
if PHONE_SETUP_TTY=1 PHONE_SETUP_RENDER_BAD_QR=1 run_phone_setup_helper \
    print_phone_setup "$PHONE_SETUP_UNSAFE" > "$PHONE_SETUP_ACTUAL"; then
    echo "phone setup accepted an unsafe value" >&2
    exit 1
fi
test ! -s "$PHONE_SETUP_ACTUAL"

