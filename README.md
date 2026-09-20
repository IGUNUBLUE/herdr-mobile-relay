# Herdr Mobile Relay

[![check](https://github.com/IGUNUBLUE/herdr-mobile-relay/actions/workflows/check.yml/badge.svg)](https://github.com/IGUNUBLUE/herdr-mobile-relay/actions/workflows/check.yml)

Control [Herdr](https://herdr.dev) agents from your phone. Each Linux or macOS
computer runs its own relay; the phone connects to them and merges every agent
into one app — installable PWA or native Android APK.

> [!NOTE]
> **This fork** tracks [`0cv/herdr-mobile-relay`](https://github.com/0cv/herdr-mobile-relay)
> and adds a zero-third-party **Tailscale Serve** transport
> ([docs/tailscale.md](docs/tailscale.md)), a **native Android app** (Tauri 2,
> no Play Store), and a mobile UX pass: live status motion, haptics,
> pull-to-refresh, skeleton loaders, and per-integration logos.

## Download the Android app

Get **`herdr-mobile-*-arm64.apk`** from
[**Releases → latest**](https://github.com/IGUNUBLUE/herdr-mobile-relay/releases/latest)
— sideload it, or add this repo to [Obtainium](https://obtainium.imranr.dev/)
for automatic updates. Other ABIs (`arm`, `x86`, `x86_64`, `universal`) ship in
the same release; verify against `apk-checksums.txt`.

In the app: **Settings → paste a setup link** from `make tailscale-setup` (or
any of the transports below). Native notifications and haptics included.

## Get started in two minutes

Requirements: Herdr 0.7.5+ (0.9.0 recommended), Git, `curl`. Linux or macOS —
native Windows is not supported (WSL2 untested).

```bash
herdr plugin install IGUNUBLUE/herdr-mobile-relay
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

## License

[GNU Affero General Public License v3.0 or later](LICENSE).
