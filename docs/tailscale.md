# Tailscale Serve transport

Tailscale Serve publishes the relay on this machine's tailnet HTTPS name —
`https://<machine>.<tailnet>.ts.net` — so the phone reaches it entirely inside
your tailnet. No Cloudflare account, no shared gateway, no public ingress: the
only third party is Tailscale's coordination server, which sees the same
metadata any tailnet connection produces and never sees plaintext (the relay's
E2EE applies on top of WireGuard).

This transport is a hard requirement on both ends. The app — PWA or Android
APK — can only load and stay connected while the phone is on the same tailnet;
there is no public URL and no fallback path. If Tailscale is off on either
side, the app cannot reach the relay at all.

It is also the only transport Lerdr supports: Linux and macOS on the computer;
the phone side works with any Tailscale client.

## Requirements — this computer

| Requirement | Why |
| --- | --- |
| Linux or macOS | The scripts drive `tailscaled` on both. |
| Tailscale installed and logged in (`tailscale status` works) | `tailscaled` terminates tailnet TLS locally. Follow [Install Tailscale on Linux](https://tailscale.com/kb/1031/install-linux) — on macOS install Tailscale.app or `brew install tailscale` + `sudo brew services start tailscaled`. |
| MagicDNS enabled on the tailnet | Provides the `machine.tailnet.ts.net` name the app connects to. On by default for new tailnets — check https://login.tailscale.com/admin/dns or follow [the MagicDNS guide](https://tailscale.com/kb/1081/magicdns). |
| HTTPS Certificates enabled on the tailnet | One toggle at https://login.tailscale.com/admin/dns → *HTTPS Certificates* — see [Enabling HTTPS](https://tailscale.com/kb/1153/enabling-https). Without it Serve cannot issue the `*.ts.net` certificate. |
| Serve approved for this node | The first `tailscale serve` on a machine prints a one-time approval link (`https://login.tailscale.com/f/serve?node=…`) and waits until you open it while logged into the admin console. Background: [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve). |
| The relay running locally | Via the setup menu, or the background user service below. |

## Requirements — the phone

| Requirement | Why |
| --- | --- |
| Android or iOS with the Tailscale app | Any recent client works; the app is a normal HTTPS web app. Install guides: [Android](https://tailscale.com/kb/1177/install-android) · [iOS](https://tailscale.com/kb/1095/install-ios). |
| Signed into the **same tailnet** and connected | `https://<machine>.<tailnet>.ts.net` only resolves and routes inside the tailnet. The app cannot be reached when Tailscale is off — keep the VPN on. |
| Chrome (Android) or Safari (iOS) | Needed for Add to Home Screen and the service worker the app relies on. |

## Verify before you start

```bash
tailscale status         # this machine is logged in and tailscaled is up
tailscale serve status   # empty, or already proxying to 127.0.0.1:8375
```

On the phone: open the Tailscale app, confirm the same tailnet, and keep the
VPN connected.

## Setup

From a checkout, or from the plugin setup menu (**1. Tailscale Serve**):

```bash
make tailscale-setup          # configure serve, verify HTTPS, print the QR
```

The link printer needs a relay binary: the installed plugin release is found
automatically, a source checkout passes its own build via
`LERDR_RELAY_BIN=bin/lerdr make tailscale-setup`.

That is the whole flow:

1. Reads this node's MagicDNS name from `tailscale status`.
2. Runs `tailscale serve --bg 8375` (skips it if already configured; refuses
   rather than overwrite a serve config pointing at a different target).
3. Waits for `https://<machine>.<tailnet>.ts.net/healthz` — the first request
   triggers certificate provisioning, so a few seconds is normal.
4. Prints the pairing QR/link through the standard setup-link machinery:
   `relay=wss://<fqdn>`, app origin `https://<fqdn>`.

Scan the QR on the phone (Tailscale app on), choose controller or reader, then
Add to Home Screen.

## Persistent service

```bash
make tailscale-service-install
```

Installs the relay as a user service — `lerdr.service` (systemd) on Linux,
`com.lerdr.service` (LaunchAgent) on macOS — running only the
relay. There is no tunnel process to supervise, because `tailscaled` owns the
tailnet listener and persists the serve configuration across reboots. Pairings
survive restarts too: the hostname is stable, so the one-use bootstrap does not
need re-arming after each launch.

Working from a source build rather than the installed release? Point the
launcher at your binary: `LERDR_RELAY_BIN=./bin/lerdr make tailscale-service-install`.

`tailscale serve` is configured once and stays in tailscaled's state; the unit
does not touch it. Re-run `make tailscale-setup` after a reinstall if the serve
configuration was cleared.

## Other commands

```bash
make tailscale-status       # tailnet name, serve config, endpoint health
make tailscale-teardown     # tailscale serve --https=443 off; relay untouched
relay/tailscale-serve.sh link   # reprint the setup QR without changing anything
```

## Notes

- The QR and its link carry the relay token plus a one-use, 10-minute
  bootstrap invitation. Treat them as secrets and reprint rather than share.
- `tailscale serve` listens on the node's tailnet IP only — nothing is exposed
  to the public internet, and other tailnet members are still blocked by the
  relay's token and E2EE handshake.
- If `tailscale serve` is already configured for a different target, setup
  stops and shows the existing config instead of replacing it.
- Reader/controller roles, revocations, push allowlists, and audit logging are
  unchanged — this transport swaps who carries the bytes, not what they mean.

## Not on a tailnet?

Tailscale is the only transport Lerdr supports, so the phone needs the VPN
client. If it is not installed yet, the [Tailscale download
page](https://tailscale.com/download) has the client for every platform and a
free personal plan covers this use case. Install it on the computer and the
phone, sign both into the same tailnet, and come back here.
