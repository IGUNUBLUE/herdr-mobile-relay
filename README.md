# Lerdr

[![check](https://github.com/IGUNUBLUE/lerdr/actions/workflows/check.yml/badge.svg)](https://github.com/IGUNUBLUE/lerdr/actions/workflows/check.yml)

Lerdr is the mobile companion for [Herdr](https://herdr.dev) coding agents —
your agents, in your pocket, Telegram-style. Each Linux or macOS computer
runs its own relay; the app connects to all of them and merges every agent
into one place: prompts, approvals, plan questions, terminal output, and
notifications. Ships as a signed native Android APK, with the same app
available as an installable PWA everywhere else.

## Download the Android app

Get **`herdr-mobile-*-arm64.apk`** from
[**Releases → latest**](https://github.com/IGUNUBLUE/lerdr/releases/latest) —
sideload it, or add this repo to [Obtainium](https://obtainium.imranr.dev/)
for automatic updates. Other ABIs (`arm`, `x86`, `x86_64`, `universal`) ship
in the same release; verify against `apk-checksums.txt`. APKs are signed by
the maintainer's release key — see
[docs/android-tauri.md](docs/android-tauri.md) for the signing details.

In the app: **Settings → scan the QR or paste a setup link** printed by the
relay (`make tailscale-setup`, or any of the transports below). Native
notifications, haptics, and biometric lock included.

No Android or prefer the browser? The same app is an installable PWA served
by the relay itself — scan the pairing QR, then Add to Home Screen. That is
the path iOS uses today.

## Get started in two minutes

Requirements: Herdr 0.7.5+ (0.9.0 recommended), Git, `curl`. Linux or macOS —
native Windows is not supported (WSL2 untested).

```bash
herdr plugin install IGUNUBLUE/lerdr
```

The setup menu opens automatically. Pick a transport — **Tailscale Serve**
(tailnet-only, zero third parties) or **Community WebRTC Gateway** (no account
needed) are the recommended paths — and scan the QR with your phone.

[QUICKSTART.md](QUICKSTART.md) has pairing detail and troubleshooting.

## What you get

| Agents | Terminal | Pairing |
| --- | --- | --- |
| <img src="images/home.jpeg" alt="Agents grouped by workspace and worktree across computers" width="260"> | <img src="images/terminal.jpeg" alt="Mobile terminal with Copy, Speak, attachments, and terminal keys" width="260"> | <img src="images/devices-qr.jpeg" alt="One-use device invitation shown as a QR code" width="260"> |

- Monitor and control agents across several computers, grouped by status and
  workspace, with agents that need input pinned on top.
- Answer approvals and plan questions from Codex, Claude Code, Devin, Hermes,
  Qoder, OpenCode, Oh My Pi, and Pi.
- Send prompts, terminal keys, and slash commands; attach screenshots, photos,
  and documents in cancellable batches.
- Read and search each agent's native conversation; inspect workspace files,
  images, and Git diffs read-only.
- Manage workspaces and Git worktrees; start, rename, clear, and stop agents.
- Have the relay read responses aloud, even with the screen off.
- Pair every phone as its own named device — controller or read-only reader —
  and revoke any of them.

**[Full feature tour →](docs/mobile-app.md)**

### Native Android extras

- **Pairing without typing**: scan the pairing QR with the in-app camera, or
  paste the setup link straight from the clipboard.
- **Native notifications** with Android channels for agents needing
  attention, finished agents, and relay status — no FCM roundtrip.
- **Biometric / device lock**: require the system fingerprint, face, or
  screen-lock prompt before the app connects or unlocks on resume (WebAuthn
  on the PWA path).
- **Hardware haptics** on sends, approvals, and denies.

## Choosing how your phone connects

| Choice | Needs | Best for |
| --- | --- | --- |
| Tailscale Serve | Tailscale on computer + phone, HTTPS certs on the tailnet | zero-third-party, tailnet-only |
| Community gateway | an installed app origin | stable, no-configuration relay |
| Cloudflare tunnel | nothing (temporary) or account + domain (permanent) | fastest trial, permanent service |
| Your own gateway | a small VPS | dedicated bandwidth and logs |

All four are end-to-end encrypted; gateways can upgrade to direct WebRTC.

- **[Transports explained →](docs/transports.md)**
- **[Tailscale Serve →](docs/tailscale.md)**
- **[Android app build/sign →](docs/android-tauri.md)**

## Documentation

| Page | What is in it |
| --- | --- |
| [QUICKSTART.md](QUICKSTART.md) | The fast path, start to paired phone |
| [docs/mobile-app.md](docs/mobile-app.md) | Every feature: agent list, terminal, devices, speech, notifications |
| [docs/android-tauri.md](docs/android-tauri.md) | Native Android shell: toolchain, signing, F-Droid path |
| [docs/transports.md](docs/transports.md) | Cloudflare, gateways, Tailscale, direct WebRTC |
| [docs/tailscale.md](docs/tailscale.md) | Tailscale Serve: requirements, setup, service |
| [docs/security.md](docs/security.md) | What is encrypted, device pairing, what an intermediary sees |
| [docs/development.md](docs/development.md) | Building, testing, contributing |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Security in one paragraph

Prompts, terminal output, uploads, and push details are encrypted end to end
between the phone and the relay. Whatever carries the traffic — tunnel or
gateway — sees connection metadata only, never plaintext. Paired credentials
distinguish controller and reader devices, mutations default to
controller-only, and the app can require device verification before it
reconnects. [Details →](docs/security.md)

## Upstream

Lerdr began as a fork of
[`0cv/herdr-mobile-relay`](https://github.com/0cv/herdr-mobile-relay), which
created the relay architecture, the end-to-end pairing model, and the phone
UI this project builds on. It has since diverged — a native Tauri 2 Android
shell, the Tailscale Serve transport, native notifications/haptics/
biometrics, and signed APK releases — and is maintained and released
independently here. Thanks and credit to the upstream authors; the AGPL
license below carries their copyright forward.

## License

[GNU Affero General Public License v3.0 or later](LICENSE).
