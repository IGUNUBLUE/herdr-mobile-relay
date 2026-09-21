ifneq (,$(wildcard .env))
include .env
export
endif

PATH := /opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$(HOME)/.local/bin:$(PATH)
export PATH

.PHONY: help setup-link rotate-token check go-check backend-check shell-check production-path-audit cross-build release-bundle-check frontend-check frontend-browser frontend-browser-release frontend-browser-attention-release relay-plugin service-install service-uninstall speech-voices web-bundle-check web-release web-release-check mobile-ci-check mobile-retention-check mobile-composite-check mobile-cache-recovery mobile-ci-run mobile-android mobile-ios tailscale-setup tailscale-teardown tailscale-status tailscale-service-install icons android-apk android-apk-split android-dev android-init

help:
	@echo "Common targets:"
	@echo "  make tailscale-setup            Publish the relay on your tailnet and print the setup QR"
	@echo "  make tailscale-status           Show tailscale serve config and endpoint health"
	@echo "  make tailscale-teardown         Stop serving the relay on the tailnet"
	@echo "  make tailscale-service-install  Install/start the relay as a background service"
	@echo "  make setup-link                 Reprint the phone setup link and QR code"
	@echo "  make rotate-token               Replace the relay token and print a new setup link"
	@echo "  make web-release                Replace ./web with a verified frontend release build"
	@echo "  make service-install            Install/start the relay service for this platform"
	@echo "  make service-uninstall          Stop/remove the relay service"
	@echo "  make speech-voices              Cache the neural voices that read responses aloud"
	@echo "  make mobile-ci-check            Check the host-only installed-PWA harness"
	@echo "  make mobile-cache-recovery MOBILE_ARGS=...  Check cached stylesheet recovery with a bundle set"
	@echo "  make mobile-ci-run MOBILE_ARGS=...  Run a configured device scenario"
	@echo "  make mobile-android MOBILE_ARGS=... Run the installed Android suite"
	@echo "  make mobile-ios MOBILE_ARGS=...    Run the installed iOS suite"
	@echo "  make check                      Run backend and frontend checks"

setup-link:
	relay/tailscale-serve.sh link

rotate-token:
	relay/rotate-token.sh

speech-voices:
	relay/speech-voices.sh

tailscale-setup:
	relay/tailscale-serve.sh start

tailscale-teardown:
	relay/tailscale-serve.sh off

tailscale-status:
	relay/tailscale-serve.sh status

tailscale-service-install:
	relay/install-tailscale-service.sh

# Native Android shell (Tauri). Needs the toolchain from docs/android-tauri.md:
# JDK 17+, Android SDK + NDK r28+, rustup Android targets, and cargo-tauri.
android-apk:
	cargo tauri android build --apk
	@echo "APKs under src-tauri/gen/android/app/build/outputs/apk/"

android-apk-split:
	cargo tauri android build --apk --split-per-abi
	@echo "Per-ABI APKs under src-tauri/gen/android/app/build/outputs/apk/"

android-dev:
	cargo tauri android dev

# Regenerate app icons from the SVG sources in src-tauri/icons-src/. The
# tauri icon step rewrites src-tauri/icons/ and, when the Android project
# exists, its launcher mipmaps — android-init always scaffolds stock icons,
# so release.yml runs this after it. Web PNGs are committed; re-rendering
# them needs rsvg-convert, which CI runners lack (and don't need).
icons:
	cd src-tauri && cargo tauri icon icons-src/manifest.json
	@if command -v rsvg-convert >/dev/null 2>&1; then \
		rsvg-convert -w 512 -h 512 src-tauri/icons-src/icon.svg -o frontend/public/icons/icon-512.png; \
		rsvg-convert -w 192 -h 192 src-tauri/icons-src/icon.svg -o frontend/public/icons/icon-192.png; \
		rsvg-convert -w 512 -h 512 src-tauri/icons-src/icon-maskable.svg -o frontend/public/icons/icon-maskable-512.png; \
		rsvg-convert -w 180 -h 180 src-tauri/icons-src/app-icon.svg -o frontend/public/icons/apple-touch-icon.png; \
		rsvg-convert -w 96 -h 96 src-tauri/icons-src/badge.svg -o frontend/public/icons/notification-badge.png; \
	else \
		echo "rsvg-convert not found; web icon PNGs unchanged (committed)"; \
	fi

# Regenerate the Android project, then permit cleartext WS/HTTP in release
# builds too: relays are user-configured and can be plain ws:// on a LAN —
# the same thing the browser PWA allows. E2EE still encrypts the payload;
# cleartext only opens the pipe. The manifest patch switches soft-input
# handling to adjustResize so the composer stays pinned above the keyboard
# instead of the whole window panning.
android-init:
	cargo tauri android init
	sed -i 's/manifestPlaceholders\["usesCleartextTraffic"\] = "false"/manifestPlaceholders["usesCleartextTraffic"] = "true"/' \
	  src-tauri/gen/android/app/build.gradle.kts
	sed -i 's/isMinifyEnabled = true/isMinifyEnabled = true\n            isShrinkResources = true/' \
	  src-tauri/gen/android/app/build.gradle.kts
	sed -i 's/versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")/versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")\n        resConfigs("en")/' \
	  src-tauri/gen/android/app/build.gradle.kts
	sed -i 's/android:launchMode="singleTask"/android:launchMode="singleTask"\n            android:windowSoftInputMode="adjustResize"/' \
	  src-tauri/gen/android/app/src/main/AndroidManifest.xml

# `web-release-check` proves `frontend/dist` and `web/` are byte-identical and
# then browser-tests `web/`, so running the same suite against `dist` here only
# doubles the slowest gate. `make frontend-browser` stays for iterating on a
# build before `web/` is regenerated.
check: backend-check frontend-check web-release-check cross-build release-bundle-check

go-check:
	@test -z "$$(gofmt -l $$(find . -name '*.go' -not -path './frontend/node_modules/*'))"
	go vet ./...
	go test ./...
	go test -race -p 1 ./...

backend-check: go-check shell-check production-path-audit

shell-check:
	@for script in relay/*.sh; do bash -n "$$script" || exit; done
	@for script in relay/plugin-on-event.sh; do sh -n "$$script" || exit; done
	@for script in install.sh scripts/*.sh; do sh -n "$$script" || exit; done
	sh tests/test_install.sh
	bash tests/test_common.sh
	bash tests/test_plugin_build.sh
	sh tests/test_release_scripts.sh
	bash tests/test_uninstall.sh
	bash tests/test_speech_voices.sh

production-path-audit:
	@if rg -n '(^|[;&|][[:space:]]*)(python3?|uv)([[:space:]]|$$)' relay --glob '*.sh' --glob '*.command'; then \
		echo "Production shell path still invokes Python or uv" >&2; \
		exit 1; \
	fi
	@if rg -n '(^|[;&|][[:space:]]*)go[[:space:]]+(build|run|install)' relay install.sh; then \
		echo "End-user install/runtime path still invokes the Go toolchain" >&2; \
		exit 1; \
	fi

cross-build:
	@tmp="$$(mktemp -d)"; trap 'rm -rf "$$tmp"' EXIT; \
	for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64; do \
		os="$${target%/*}"; arch="$${target#*/}"; \
		for command in ./cmd/lerdr; do \
			CGO_ENABLED=0 GOOS="$$os" GOARCH="$$arch" go build -trimpath \
				-o "$$tmp/$$(basename $$command)-$$os-$$arch" "$$command" || exit; \
		done; \
	done

release-bundle-check:
	@tmp="$$(mktemp -d)"; trap 'rm -rf "$$tmp"' EXIT; \
	version="$$(sed -n 's/^version = "\([^"]*\)"/\1/p' herdr-plugin.toml)"; \
	revision="$$(git rev-parse HEAD 2>/dev/null || echo test-revision)"; \
	scripts/package-release.sh "$$version" "$$revision" "$$tmp"; \
	test "$$(find "$$tmp" -name 'lerdr_*.tar.gz' | wc -l)" -eq 4; \
	test -s "$$tmp/checksums.txt"; \
	host_os="$$(go env GOOS)"; host_arch="$$(go env GOARCH)"; \
	scripts/check-installed-release.sh \
		"$$tmp/lerdr_$${version}_$${host_os}_$${host_arch}.tar.gz" \
		"$$tmp/checksums.txt" "$$version" "$$revision" "$${host_os}/$${host_arch}"

frontend-check:
	bun run --cwd frontend lint
	bun run --cwd frontend check
	bun run --cwd frontend test
	bun run --cwd frontend build
	bun run --cwd frontend size
	bun build frontend/public/sw.js --outfile=/dev/null
	bun build frontend/public/notification-icons.js --outfile=/dev/null
	bash -n frontend/scripts/run-browser-tests.sh
	bash -n frontend/scripts/run-attention-tests.sh

frontend-browser:
	frontend/scripts/run-browser-tests.sh dist

frontend-browser-release:
	frontend/scripts/run-browser-tests.sh ../web

frontend-browser-attention-release:
	LERDR_WEB_ROOT=../web HERDR_WEB_ROOT=../web bun run --cwd frontend test:browser:attention

relay-plugin:
	herdr plugin link .

service-install:
	relay/install-tailscale-service.sh

service-uninstall:
	@if [ "$$(uname -s)" = "Darwin" ]; then \
		bash relay/uninstall-service.sh; \
	else \
		bash relay/uninstall-systemd-user-service.sh; \
	fi

web-bundle-check:
	bun frontend/scripts/validate-build.mjs web
	bun frontend/scripts/check-size.mjs web
	bun build web/sw.js --outfile=/dev/null
	bun build web/notification-icons.js --outfile=/dev/null

web-release:
	bun frontend/scripts/bump-assets.mjs
	$(MAKE) frontend-check
	bun frontend/scripts/release.mjs
	$(MAKE) web-bundle-check

web-release-check: web-bundle-check
	@diff -qr frontend/dist web
	$(MAKE) frontend-browser-release
	$(MAKE) frontend-browser-attention-release

mobile-ci-check: mobile-retention-check mobile-composite-check
	bun install --frozen-lockfile --cwd frontend
	bun install --frozen-lockfile --cwd tests/mobile
	bun run --cwd tests/mobile lint
	bun run --cwd tests/mobile check
	bun run --cwd tests/mobile test:unit
	go test ./tests/mobile/fixture
	go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 -shellcheck= -pyflakes= .github/workflows/check.yml .github/workflows/mobile-ci.yml .github/workflows/release.yml

mobile-retention-check:
	bun tests/mobile/retention-check.ts .github

mobile-composite-check:
	bun tests/mobile/composite-check.ts .github/actions

mobile-cache-recovery:
	@test -n "$(MOBILE_ARGS)" || (echo 'MOBILE_ARGS is required' >&2; exit 2)
	bun run --cwd tests/mobile test:cache-recovery -- $(MOBILE_ARGS)

mobile-ci-run:
	bun run --cwd tests/mobile run -- $(MOBILE_ARGS)

mobile-android:
	@test -n "$(MOBILE_ARGS)" || (echo 'MOBILE_ARGS is required' >&2; exit 2)
	MOBILE_PLATFORM=android $(MAKE) mobile-ci-run MOBILE_ARGS="$(MOBILE_ARGS)"

mobile-ios:
	@test -n "$(MOBILE_ARGS)" || (echo 'MOBILE_ARGS is required' >&2; exit 2)
	MOBILE_PLATFORM=ios $(MAKE) mobile-ci-run MOBILE_ARGS="$(MOBILE_ARGS)"
