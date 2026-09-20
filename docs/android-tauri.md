# Native Android app (Tauri)

The repository ships a Tauri 2 shell in [`src-tauri/`](../src-tauri) that
builds the same frontend the relay serves — one codebase, two install
surfaces. The PWA stays the default path; the APK adds a native icon,
hardware haptics, and real Android notifications without a service worker.

Distribution is **GitHub Releases** (sideload / Obtainium) — no Play Store.
F-Droid is possible later but needs a reproducible-build recipe in
`fdroiddata`; that is a separate process, tracked below.

## What works in the shell

- Everything the PWA does: pairing, E2EE, WSS/WebRTC to the relay, terminal,
  approvals, uploads, Tailscale endpoints (`wss://host.tailnet.ts.net` works —
  the Tailscale Android app provides the VPN underneath).
- Blocked-agent, finished, and relay-status alerts post **local
  notifications** through `tauri-plugin-notification`, driven by the live
  socket — no FCM roundtrip. Channels (`agents-attention`,
  `agents-finished`, `relay-status`) are registered in `lib.rs` at startup;
  attention alerts group under one shade entry with inbox lines.
- Haptics run through `tauri-plugin-haptics`; the web `navigator.vibrate`
  fallback stays for the PWA.
- **Scan QR** opens the in-app camera scanner
  (`tauri-plugin-barcode-scanner`); CAMERA is requested at use time, not at
  install. **Paste setup link** reads the clipboard
  (`tauri-plugin-clipboard-manager` — `read_text` returns the raw string,
  not an object). Both feed the same `setup-link.ts` parser as the URL.
- **Require device unlock** uses `tauri-plugin-biometric` — the system
  fingerprint/face/screen-lock prompt — while the PWA keeps WebAuthn.
- The Android back button follows the app's `pushState` history — back from
  a terminal view returns to the agent list; back at the root exits.

## What differs from the PWA

| PWA | Tauri shell |
|---|---|
| Web Push via service worker | Local notifications from live events |
| `setAppBadge` icon count | Not available in WebView (notification shade carries it) |
| Install via "Add to Home Screen" | APK sideload from GitHub Releases |
| Pairing by scanning a QR link | Scan QR in-app or paste the setup link in Settings |
| WebAuthn device unlock | System biometric / screen-lock prompt |

Pairing links are `https://<relay-host>/#…` with user-specific hosts, so
Android App Links cannot intercept them (domain verification is per-host).
Open the app and scan or paste the link — both land in the same import
path; the QR path keeps working for the browser PWA.

## Build requirements

Verified on Linux with this exact toolchain:

- **JDK 17+** — e.g. `apt install openjdk-17-jdk-headless`, or a portable
  Temurin tarball:
  ```bash
  curl -L -o /tmp/jdk17.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p ~/.local/opt && tar xzf /tmp/jdk17.tar.gz -C ~/.local/opt
  mv ~/.local/opt/jdk-17* ~/.local/opt/jdk17
  export JAVA_HOME=~/.local/opt/jdk17 PATH="$JAVA_HOME/bin:$PATH"
  ```
- **Rust targets**:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi \
    i686-linux-android x86_64-linux-android
  ```
- **Tauri CLI**: `cargo install tauri-cli --version "^2" --locked`
- **Android SDK + NDK r28+** (r28 aligns native libs for the 16 KB page
  size Android 15 requires; `build.rs` also injects the ELF link args):
  ```bash
  mkdir -p ~/Android/Sdk/cmdline-tools && cd ~/Android/Sdk/cmdline-tools
  curl -O https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
  unzip commandlinetools-linux-*.zip && mv cmdline-tools latest
  export ANDROID_HOME=~/Android/Sdk
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  yes | sdkmanager --licenses
  sdkmanager "platform-tools" "platforms;android-35" \
    "build-tools;35.0.0" "ndk;28.2.13676358"
  export NDK_HOME="$ANDROID_HOME/ndk/28.2.13676358"
  ```

## Build

```bash
make android-init   # once per clone — generates src-tauri/gen/android/
make android-apk    # release APK (unsigned), embeds a fresh frontend build
```

`beforeBuildCommand` runs `bun run --cwd ../frontend build` automatically —
the APK always embeds the validated `frontend/dist` bundle (the committed
`web/` release bundle is untouched by native builds). Debug APK for local
testing: `cargo tauri android build --apk --debug` (auto debug-signed).

Unsigned output lands under
`src-tauri/gen/android/app/build/outputs/apk/`. Per-ABI splits
(`make android-apk-split`) shrink each APK from ~43 MB universal to
~12–15 MB — aarch64 alone covers every modern phone.

## Signing and publishing

APKs must be signed to install. Keep the keystore **outside the repo** —
whoever holds it controls updates:

```bash
# one-time
keytool -genkeypair -keystore ~/.local/share/lerdr/android-release.jks \
  -alias herdr-mobile -keyalg RSA -keysize 2048 -validity 10950

# per release
zipalign -p -f 4 app-universal-release-unsigned.apk lerdr-0.23.0-universal.apk
apksigner sign --ks ~/.local/share/lerdr/android-release.jks \
  --ks-key-alias herdr-mobile lerdr-0.23.0-universal.apk
apksigner verify lerdr-0.23.0-universal.apk
sha256sum lerdr-*.apk > apk-checksums.txt
gh release upload v0.23.0 lerdr-*.apk apk-checksums.txt \
  --repo IGUNUBLUE/lerdr
```

`zipalign` and `apksigner` live in `$ANDROID_HOME/build-tools/35.0.0/`.
Lerdr releases are signed with the key under
`~/.local/share/lerdr/` on the maintainer's machine — never
committed, and only in CI secrets when reproducibility is explicitly
traded for convenience (below).

## CI APK build

`release.yml` has an `android-apk` job that builds the universal release
APK on `ubuntu-24.04` (Temurin JDK 17, `cargo-tauri`, NDK
`28.2.13676358`, `make android-apk`) and attaches it to the GitHub
release as `lerdr_<version>_universal.apk` alongside the relay tarballs.

Signing is opt-in. With no secrets configured the job still runs and
uploads `lerdr_<version>_universal-unsigned.apk` as a workflow artifact —
sign it locally per the commands above. To sign in CI, add these
repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 ~/.local/share/lerdr/android-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore store password |
| `ANDROID_KEY_ALIAS` | `herdr-mobile` (kept from before the rename) |
| `ANDROID_KEY_PASSWORD` | key password (same as store password if unset) |

The keystore lands in `$RUNNER_TEMP` (outside the workspace, `umask 077`)
for the duration of the signing step and is deleted immediately after.

## F-Droid path (later)

Inclusion needs: all deps from source (Rust crates are fine), no proprietary
services, a metadata recipe in `gitlab.com/fdroid/fdroiddata`, and a
reproducible build. The shell already has no telemetry and no Play-only
APIs, so the main work is the recipe — not the code. The per-ABI APK layout
maps cleanly onto F-Droid's build variants.

## Notes

- `tauri.conf.json` pins `identifier` `com.github.igunublue.lerdr` — the
  Android application id; changing it creates a different app. It was
  `com.github.igunublue.herdr-mobile-relay` before the Lerdr rename, so
  pre-rename installs cannot be upgraded in place — uninstall and
  reinstall instead (pairings do not survive).
- CSP allows `https:`/`wss:`/`http:`/`ws:` connect-src: the app dials
  user-configured relay hosts, which cannot be enumerated ahead of time.
  Cleartext is enabled (`usesCleartextTraffic=true`, patched by
  `make android-init`) so LAN relays can serve plain `ws://` — the E2EE
  handshake still protects payload confidentiality, but transport metadata
  is visible on the local network. Prefer `wss://` (Tailscale Serve,
  gateway) whenever possible.
- Capabilities (`src-tauri/capabilities/default.json`) grant only
  `core:default` plus each plugin's `default` set: notification,
  haptics, barcode-scanner (camera check/request + scan + cancel),
  biometric (status + authenticate), and clipboard-manager (read/write
  text) — nothing else. Audit before adding plugins.
- `src-tauri/gen/` (generated Android Studio project) and `target/` are
  gitignored; regenerate with `cargo tauri android init` after pulling.
- Background behavior: Android may suspend the WebView's WebSocket when the
  app is backgrounded; the app's reconnect logic resumes on foreground. A
  foreground service for always-on sockets is a possible follow-up.
