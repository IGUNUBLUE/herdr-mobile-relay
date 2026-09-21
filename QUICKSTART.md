# Lerdr Quick Start

Connect one Linux or macOS computer to your phone over your tailnet. Tailscale
is the only transport Lerdr supports and it is a hard requirement on both ends:
the phone app — PWA or Android APK — cannot load or reach the relay unless both
devices are on the same tailnet. Follow
[docs/tailscale.md](docs/tailscale.md) first; it lists the requirements on the
computer (Tailscale, MagicDNS, HTTPS certificates, Serve approval) and on the
phone (the Tailscale app, same tailnet, VPN on).

You need Herdr 0.7.5 or newer, Git, and `curl`. Herdr 0.9.0 is recommended for
the complete live JSON inventory and workspace-management surface, but it is
not the relay's minimum supported version.

The relay shows the installed Herdr client separately from the running server
version and protocol. If those differ, Settings reports the affected feature
rather than treating the whole connection as unavailable.

## 1. Install

```bash
herdr plugin install IGUNUBLUE/lerdr
```

The setup menu opens after the install finishes. If it does not:

```bash
herdr plugin action invoke setup --plugin lerdr.events
```

Approve missing user-level tools if prompted. The plugin downloads the exact
verified relay bundle; it does not require Python, Node.js, a Go toolchain, or
`sudo`.

## 2. Pair the Phone

Choose **1. Tailscale Serve**. The setup publishes the relay on this machine's
tailnet HTTPS name (`https://<machine>.<tailnet>.ts.net`), waits for the
endpoint to answer, and prints the private setup QR.

Scan the QR or open the complete HTTPS setup link. Keep it private: it contains
the one-use bootstrap invitation in the URL fragment, which is never sent in
the HTTP request. The installed app removes it after enrollment. iOS browser
tabs retain it without redeeming it and direct you to the installed app, which
prevents a disposable Safari tab from consuming the invitation. Each printed
link pairs one phone within ten minutes; print it again for the next phone.

Pairings survive relay restarts: the tailnet hostname is stable, so enrolled
devices stay valid across upgrades and reboots.

## 3. Try It

Run an agent in Herdr or tap **＋** in the phone app. You can inspect output,
send prompts, answer approvals and plan questions, upload images, and manage the
agent lifecycle.

On hosts with a published Piper runtime, setup downloads the engine and the
English voice that reads responses aloud, cached outside the release so updates
never fetch them again. Reading aloud turns itself on the first time. French,
German, Spanish, and Chinese are downloaded on demand from the phone's Settings
or with `relay/speech-voices.sh --languages fr`. Stock Apple Silicon uses
macOS `say`; Settings does not offer neural voice downloads unless Piper is
already installed.

If a relay was updated after a failed Piper runtime extraction, reinstall only
the cached engine with `relay/speech-voices.sh --reinstall-runtime`. The
downloaded voices remain in place.

## Run It in the Background

Install the relay as a user service — systemd on Linux, launchd on macOS.
From a plugin install:

```bash
~/.local/share/lerdr/current/relay/install-tailscale-service.sh
```

From a checkout:

```bash
make tailscale-service-install
```

`tailscaled` owns the tailnet listener and persists the serve configuration
across reboots, so the unit supervises only the relay. Repeat on each computer
and add every QR to the same phone app.

[docs/tailscale.md](docs/tailscale.md) has the rest: status, teardown,
re-printing the QR, and uninstall.

## Troubleshooting

- **Port 8375 is busy:** stop the previous relay instance or installed service.
- **`tailscale serve` waits on an approval link:** open the printed
  `https://login.tailscale.com/f/serve?node=…` URL while signed into the admin
  console — it is a one-time per-node approval.
- **The phone cannot open the setup link:** confirm the Tailscale app is on,
  signed into the same tailnet, and that MagicDNS resolves
  `<machine>.<tailnet>.ts.net` on the phone (`tailscale status` on the
  computer lists the tailnet name).
- **App still shows the previous release after the relay updates:** open
  Settings, choose **Check for Updates**, then **Load Update**.
- **Need the setup QR again:** invoke `setup-link`, or choose **2. Show Phone
  Setup QR** in the setup menu.
- **Relay status:** `herdr plugin action invoke status --plugin lerdr.events`.

[README.md](README.md) indexes the rest of the documentation.
