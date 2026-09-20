#!/bin/sh
set -eu

REPO_DIR=$(CDPATH='' cd "${0%/*}/.." && pwd)
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/lerdr-install-test.XXXXXX")
trap 'rm -rf "$WORK_DIR"' EXIT INT TERM

# Load the installer functions without executing main.
sed '$d' "$REPO_DIR/install.sh" > "$WORK_DIR/install-functions.sh"
# shellcheck source=/dev/null
. "$WORK_DIR/install-functions.sh"

release_json='{
  "assets": [{
    "url": "https://api.github.com/repos/IGUNUBLUE/lerdr/releases/assets/123",
    "name": "lerdr_0.9.0_linux_amd64.tar.gz",
    "uploader": {
      "url": "https://api.github.com/users/0cv"
    }
  }, {
    "url": "https://api.github.com/repos/IGUNUBLUE/lerdr/releases/assets/124",
    "name": "checksums.txt",
    "uploader": {
      "url": "https://api.github.com/users/0cv"
    }
  }]
}'

archive_url=$(resolve_asset_url "$release_json" "lerdr_0.9.0_linux_amd64.tar.gz")
checksum_url=$(resolve_asset_url "$release_json" "checksums.txt")
test "$archive_url" = "https://api.github.com/repos/IGUNUBLUE/lerdr/releases/assets/123"
test "$checksum_url" = "https://api.github.com/repos/IGUNUBLUE/lerdr/releases/assets/124"

commit_json='{"sha":"0123456789abcdef0123456789abcdef01234567","commit":{"tree":{"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}'
test "$(resolve_tag_revision "$commit_json")" = "0123456789abcdef0123456789abcdef01234567"

sentinel_root="$WORK_DIR/custom-root"
write_install_sentinel "$sentinel_root"
canonical_root=$(CDPATH='' cd "$sentinel_root" && pwd -P)
grep -Fx 'product=lerdr' "$sentinel_root/.lerdr-installation" >/dev/null
grep -Fx "root=$canonical_root" "$sentinel_root/.lerdr-installation" >/dev/null

# A sentinel left by a pre-rename install proves ownership, then upgrades.
upgrade_root="$WORK_DIR/upgrade-root"
mkdir -p "$upgrade_root"
printf 'product=herdr-mobile-relay\nroot=%s\n' \
    "$(CDPATH='' cd "$upgrade_root" && pwd -P)" > "$upgrade_root/.herdr-mobile-relay-installation"
write_install_sentinel "$upgrade_root"
test -f "$upgrade_root/.lerdr-installation"
test ! -e "$upgrade_root/.herdr-mobile-relay-installation"
grep -Fx 'product=lerdr' "$upgrade_root/.lerdr-installation" >/dev/null

unowned_root="$WORK_DIR/unowned"
mkdir -p "$unowned_root"
printf 'personal data\n' > "$unowned_root/keep.txt"
if (write_install_sentinel "$unowned_root") 2>/dev/null; then
    echo "write_install_sentinel claimed a nonempty unowned directory" >&2
    exit 1
fi
[ -f "$unowned_root/keep.txt" ]
[ ! -e "$unowned_root/.lerdr-installation" ]

# A pre-rename install moves wholesale to the lerdr paths: config and cache
# contents land under the new roots and the old directories are gone.
legacy_home="$WORK_DIR/legacy-home"
new_release="$legacy_home/.local/share/lerdr"
new_config="$legacy_home/.config/lerdr"
new_cache="$legacy_home/.cache/lerdr"
legacy_config="$legacy_home/.config/herdr-mobile-relay"
legacy_cache="$legacy_home/.cache/herdr-mobile-relay"
mkdir -p "$legacy_config/device-auth" "$legacy_config/push" "$legacy_cache/claude-history" "$legacy_cache/uploads"
printf "HERDR_RELAY_TOKEN='legacy-token'\nHERDR_RELAY_INSTANCE_ID='legacy-instance'\n" > "$legacy_config/relay.env"
printf 'https://app.example.test\n' > "$legacy_config/phone-app-origin-configured"
printf '{"schema_version":1,"credentials":[]}\n' > "$legacy_config/device-auth/devices.json"
printf '[]\n' > "$legacy_config/push/subscriptions.json"
printf '{"state":"failed"}\n' > "$legacy_config/update-state.json"
printf '{"state":"idle"}\n' > "$legacy_config/app-deploy-state.json"
printf 'private-token\n' > "$legacy_config/github-token"
chmod 600 "$legacy_config/github-token"
printf '{"id":"legacy"}\n' > "$legacy_cache/activity.jsonl"
printf '[]\n' > "$legacy_cache/activity.tombstones"
mkdir -p "$legacy_cache/push"
printf 'private-key\n' > "$legacy_cache/push/vapid_private.pem"
printf 'verified\n' > "$legacy_cache/approval-verification-1"
printf '{"history":["preserved"]}\n' > "$legacy_cache/claude-history/pane.json"
HOME="$legacy_home"
XDG_DATA_HOME="$legacy_home/.local/share"
XDG_CONFIG_HOME="$legacy_home/.config"
XDG_CACHE_HOME="$legacy_home/.cache"
prepare_install_roots "$new_release" "$new_config" "$new_cache" 1 1
test ! -e "$legacy_config"
test ! -e "$legacy_cache"
test -f "$new_config/.lerdr-installation"
test -f "$new_cache/.lerdr-installation"
grep -F legacy-token "$new_config/relay.env" >/dev/null
test "$(cat "$new_config/phone-app-origin-configured")" = "https://app.example.test"
test "$(cat "$new_config/device-auth/devices.json")" = '{"schema_version":1,"credentials":[]}'
grep -F failed "$new_config/update-state.json" >/dev/null
grep -F idle "$new_config/app-deploy-state.json" >/dev/null
grep -F preserved "$new_cache/claude-history/pane.json" >/dev/null

# A sentinel'd pre-rename release root moves too, and an absolute `current`
# link recorded under the old path is repointed at the new root.
moved_home="$WORK_DIR/moved-home"
moved_release="$moved_home/.local/share/lerdr"
old_release="$moved_home/.local/share/herdr-mobile-relay"
mkdir -p "$old_release/releases/0.25.0-abc-linux-amd64"
old_release_real=$(CDPATH='' cd "$old_release" && pwd -P)
printf 'product=herdr-mobile-relay\nroot=%s\n' "$old_release_real" \
    > "$old_release/.herdr-mobile-relay-installation"
ln -s "$old_release_real/releases/0.25.0-abc-linux-amd64" "$old_release/current"
HOME="$moved_home"
XDG_DATA_HOME="$moved_home/.local/share"
XDG_CONFIG_HOME="$moved_home/.config"
XDG_CACHE_HOME="$moved_home/.cache"
prepare_install_roots "$moved_release" "$moved_home/.config/lerdr" \
    "$moved_home/.cache/lerdr" 1 1
test ! -e "$old_release"
test -f "$moved_release/.lerdr-installation"
test "$(readlink "$moved_release/current")" = \
    "$moved_release/releases/0.25.0-abc-linux-amd64" ||
    test "$(readlink "$moved_release/current")" = \
    "$(CDPATH='' cd "$moved_release" && pwd -P)/releases/0.25.0-abc-linux-amd64"

symlink_config="$WORK_DIR/symlink-config"
mkdir -p "$symlink_config"
printf "HERDR_RELAY_TOKEN='legacy-token'\n" > "$symlink_config/relay.env"
ln -s "$new_config/relay.env" "$symlink_config/linked.env"
if (write_install_sentinel "$symlink_config" config) 2>/dev/null; then
    echo "write_install_sentinel accepted a symlinked legacy config" >&2
    exit 1
fi
test ! -e "$symlink_config/.lerdr-installation"

# When the new cache already exists, old entries merge in without replacing
# anything and the emptied old root is removed.
xdg_home="$WORK_DIR/xdg-home"
xdg_release="$xdg_home/.local/share/lerdr"
xdg_config="$xdg_home/.config/lerdr"
old_cache="$xdg_home/.cache/herdr-mobile-relay"
new_cache="$xdg_home/custom-cache/lerdr"
mkdir -p "$xdg_config/push" "$old_cache/claude-history"
printf "HERDR_RELAY_TOKEN='xdg-token'\n" > "$xdg_config/relay.env"
printf '[]\n' > "$xdg_config/push/subscriptions.json"
printf '{"history":["migrated"]}\n' > "$old_cache/claude-history/pane.json"
mkdir -p "$new_cache"
printf '#!/bin/sh\n' > "$new_cache/post-install.sh"
printf 'legacy waiter\n' > "$new_cache/post-install.log"
HOME="$xdg_home"
XDG_DATA_HOME="$xdg_home/.local/share"
XDG_CONFIG_HOME="$xdg_home/.config"
XDG_CACHE_HOME="$xdg_home/.cache"
prepare_install_roots "$xdg_release" "$xdg_config" "$new_cache" 1 1
test ! -e "$old_cache"
grep -F migrated "$new_cache/claude-history/pane.json" >/dev/null
grep -F 'legacy waiter' "$new_cache/post-install.log" >/dev/null
test -f "$new_cache/.lerdr-installation"

timeout_started=$(date +%s)
if run_with_timeout 1 sleep 3; then
    echo "run_with_timeout did not time out" >&2
    exit 1
fi
timeout_finished=$(date +%s)
test "$((timeout_finished - timeout_started))" -lt 3

signal_downloader="$WORK_DIR/signal-downloader"
for signal_kind in wget curl; do
    signal_bin="$WORK_DIR/signal-bin-$signal_kind"
    mkdir -p "$signal_bin"
    for signal_command in awk dirname find head mktemp rm sed sleep tar tr uname; do
        ln -s "$(command -v "$signal_command")" "$signal_bin/$signal_command"
    done
    ln -s "$signal_downloader" "$signal_bin/$signal_kind"
done
cat > "$signal_downloader" <<'EOF'
#!/bin/sh
output=-
url=
case "${0##*/}" in
    wget)
        for arg do
            case "$arg" in
                --output-document=*) output=${arg#--output-document=} ;;
                *) url=$arg ;;
            esac
        done
        ;;
    curl)
        expect_output=0
        for arg do
            if [ "$expect_output" -eq 1 ]; then
                output=$arg
                expect_output=0
                continue
            fi
            case "$arg" in
                --output) expect_output=1 ;;
                --output=*) output=${arg#--output=} ;;
                *) url=$arg ;;
            esac
        done
        ;;
    *)
        exit 1
        ;;
esac
hang() {
    printf '%s\n' "$$" > "$DOWNLOAD_PID_FILE"
    trap 'exit 143' INT TERM
    while :; do
        sleep 1
    done
}
case "$url" in
    *commits/*)
        if [ "$DOWNLOAD_HANG_STAGE" = commits ]; then
            hang
        fi
        data='{"sha":"0123456789abcdef0123456789abcdef01234567"}'
        ;;
    *checksums.txt)
        data='placeholder'
        ;;
    *tar.gz)
        if [ "$DOWNLOAD_HANG_STAGE" = archive ]; then
            hang
        fi
        data=placeholder
        ;;
    *)
        exit 1
        ;;
esac
if [ "$output" = "-" ]; then
    printf '%s' "$data"
else
    printf '%s\n' "$data" > "$output"
fi
EOF
chmod 700 "$signal_downloader"

run_signal_install() {
    signal_kind=$1
    signal_stage=$2
    signal_root="$WORK_DIR/signal-$signal_kind-$signal_stage"
    signal_bin="$WORK_DIR/signal-bin-$signal_kind"
    signal_tmp="$signal_root/tmp"
    signal_home="$signal_root/home"
    signal_pid_file="$signal_root/downloader.pid"
    signal_log="$signal_root/install.log"
    mkdir -p "$signal_tmp" "$signal_home"
    (
        PATH="$signal_bin" \
        HOME="$signal_home" \
        XDG_DATA_HOME="$signal_home/.local/share" \
        XDG_CONFIG_HOME="$signal_home/.config" \
        XDG_CACHE_HOME="$signal_home/.cache" \
        TMPDIR="$signal_tmp" \
        VERSION=1.2.3 \
        DOWNLOAD_HANG_STAGE="$signal_stage" \
        DOWNLOAD_PID_FILE="$signal_pid_file" \
        /bin/sh "$REPO_DIR/install.sh" >"$signal_log" 2>&1
    ) &
    signal_installer_pid=$!
    signal_wait=0
    while [ ! -s "$signal_pid_file" ] && [ "$signal_wait" -lt 10 ]; do
        sleep 1
        signal_wait=$((signal_wait + 1))
    done
    if [ ! -s "$signal_pid_file" ]; then
        cat "$signal_log" >&2 || true
        kill "$signal_installer_pid" 2>/dev/null || true
        wait "$signal_installer_pid" 2>/dev/null || true
        echo "installer signal test did not reach $signal_kind $signal_stage download" >&2
        return 1
    fi
    signal_downloader_pid=$(cat "$signal_pid_file")
    kill -TERM "$signal_installer_pid"
    if wait "$signal_installer_pid"; then
        signal_status=0
    else
        signal_status=$?
    fi
    if [ "$signal_status" -ne 143 ]; then
        cat "$signal_log" >&2 || true
        echo "installer did not exit with SIGTERM status: $signal_status" >&2
        return 1
    fi
    if kill -0 "$signal_downloader_pid" 2>/dev/null; then
        kill -KILL "$signal_downloader_pid" 2>/dev/null || true
        echo "installer left the $signal_kind downloader running" >&2
        return 1
    fi
    test -z "$(find "$signal_tmp" -mindepth 1 -maxdepth 1 -print -quit)"
}

run_signal_install wget commits
run_signal_install wget archive
run_signal_install curl commits
run_signal_install curl archive

echo "install shell tests passed"
