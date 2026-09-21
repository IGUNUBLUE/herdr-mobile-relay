# Updates and Herdr compatibility

How relay releases are verified, activated, and rolled back, how phone-driven
upgrades work, and which Herdr versions the relay supports. Read this before
upgrading a relay.

## How a release is installed

The plugin installs a pre-built, checksum- and manifest-verified bundle for the
exact version in `herdr-plugin.toml`. Updates atomically activate the
executable, web app, and runtime wrappers, verify their exact version,
revision, and web hash after restart, and roll back the complete release if
verification fails.

Phone-driven upgrades run `herdr plugin install` in a transient worker pinned
to the release commit.

## Upgrading to v0.21.0

Version 0.21.0 adds live Herdr compatibility reporting, JSON-backed workspace
and linked-worktree management, and verified Android/iOS installed-PWA device
coverage. Settings distinguishes the installed Herdr client from the running
server and reports affected feature support instead of treating one mismatch
as a total connection failure.

The relay serves the phone app itself, so an update swaps the bundle the phone
loads — but the update screen remains incomplete until the new phone bundle
initializes and reports its verified build identity. Relay-only updates do not
claim to have updated the phone.

Phone acknowledgement also requires the integrity-checked stylesheet to have
loaded. This uses the browser's stylesheet state, not a readiness flag from
the separately cached manifest bootstrap, so a cached older bootstrap cannot leave a
successfully loaded phone app stuck at an incomplete progress value.

Hosted releases use a build-specific entry and content-addressed JavaScript and
CSS with integrity metadata. `/` and `/index.html` remain same-origin bootstrap
URLs, so an installed app keeps its manifest identity, storage, pairings, and
preferences while it crosses the cutover. Pending progress survives a restart;
a failed or exhausted automatic reload is shown as an actionable phone-load
failure rather than retried indefinitely.

If the app cannot load the new bundle, leave the pending update item in place
and use **Load Update** once more from the existing app. If the bounded recovery
is exhausted, inspect the displayed version/build identity and deployment
status; do not clear browser data or reinstall, because those actions discard
the credentials and preferences the recovery is designed to preserve.

## Upgrading from v0.19.1

Version 0.20.0 replaces E2EE v1 and the shared relay key with E2EE v2 and
per-device credentials. The phone updater intentionally refuses this transport
boundary because neither an app-first nor a relay-first rollout can keep the
old phone connected.

Upgrade each relay manually, exactly as for a fresh install:

```bash
herdr plugin install IGUNUBLUE/lerdr
```

The setup menu opens by itself a moment after the install finishes. If it does
not, open it:

```bash
herdr plugin action invoke setup --plugin lerdr.events
```

Releases before Tailscale-only could serve the app from a separately hosted
origin; that app is still 0.19.1 and cannot talk to the new relay. Open the
app on the relay's own address (`https://<machine>.<tailnet>.ts.net`) instead.

Then print a fresh bootstrap QR (**1. Tailscale Serve** in the setup menu). It
pairs one phone; print it again (**2. Show Phone Setup QR**) for each
additional phone, or use **Settings → Devices → Invite Device** on a paired
controller to create a reader or controller invitation from the phone.
Previously paired phones cannot reuse their v0.19.1 key: pair them again with a
freshly printed link.

`LERDR_NO_AUTO_SETUP=1` in front of the install command suppresses
the automatic menu; it exists for unattended upgrades, not for this one.

## Release checks and app reloads

Release checks use the GitHub API. When an unauthenticated request is rate
limited, they fall back to the public `releases/latest` redirect for the stable
tag and that tag's Atom commit feed for its revision. Loading a
new phone bundle uses a versioned navigation, so a sleeping browser or
installed PWA does not reuse a stale document.

## Herdr version compatibility

The relay continues to support Herdr 0.7.5 or newer.

Herdr 0.8.0 and newer can resume restored agent sessions without a TUI
attached ([#2064](https://github.com/herdrdev/herdr/issues/2064)) and keep the
desktop user's focus when a background workspace closes
([#1328](https://github.com/herdrdev/herdr/discussions/1328),
[#1621](https://github.com/herdrdev/herdr/issues/1621)). Phone-driven **Stop**
still cascades a single-tab workspace away; the workspace then reports
`workspace_not_found`.

Herdr releases newer than 0.8.2 add screen-based working-state fallbacks for
Claude Code ([#1630](https://github.com/herdrdev/herdr/issues/1630),
[#2241](https://github.com/herdrdev/herdr/issues/2241)): a visible turn,
background shells, or background agents keep a pane reported as working when
terminal titles are unavailable or disabled. That accuracy flows straight to
the phone, which keys completion notifications and history capture off those
status transitions.

## Installed-PWA upgrade coverage

The installed-device suite in `docs/mobile-device-ci.md` checks the executing
phone build, not only `/version.json`, while preserving real encrypted relay
credentials and preferences. It uses historical old bundles, a deterministic
HTTPS fixture, bounded asset faults, and native Home Screen relaunches. A green
simulator run does not replace the separate physical-device signoff for a
user-facing release.

## Troubleshooting

- **Update operation failed with `read canonical release: HTTP 403`:** an older
  relay's unauthenticated GitHub release check was rate-limited. Run
  `LERDR_NO_AUTO_SETUP=1 herdr plugin install IGUNUBLUE/lerdr --yes`
  once on that computer as the signed-in user; current releases retry through
  the public release redirect and commit feed.
- **Updated app still shows the previous version:** open Settings, choose
  **Check for Updates**, then **Load Update**.
