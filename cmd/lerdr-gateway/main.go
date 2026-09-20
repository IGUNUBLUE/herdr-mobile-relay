// Command lerdr-gateway runs the blind WebSocket rendezvous gateway that pairs
// Lerdr computer relays with their phones. It holds no secrets, sees only
// ciphertext, and is configured entirely through the environment so a container
// needs no command line.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/IGUNUBLUE/lerdr/internal/gateway"
)

// drainTimeout bounds how long the HTTP server is given to finish in-flight
// requests after the relay links have been dropped.
const drainTimeout = 10 * time.Second

var (
	version  = "dev"
	revision = "unknown"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	addr := envString("GATEWAY_ADDR", ":8443")

	logger, err := newLogger(envString("GATEWAY_LOG_FORMAT", "text"))
	if err != nil {
		return err
	}
	slog.SetDefault(logger)

	opts, err := loadOptions()
	if err != nil {
		return err
	}
	opts.Logger = logger

	srv, err := gateway.New(opts)
	if err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:    addr,
		Handler: srv.Handler(),
		// Read and write deadlines are deliberately absent: both WebSocket
		// routes are long lived. Only the header read is bounded.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("gateway listening", "addr", addr)
		serveErr <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			_ = srv.Close()
			return fmt.Errorf("gateway: listen on %s: %w", addr, err)
		}
	case <-ctx.Done():
		logger.Info("gateway shutting down")
	}

	// Drop the relay links first so their handlers return, then let the HTTP
	// server drain whatever plain requests are still in flight.
	closeErr := srv.Close()

	drainCtx, cancel := context.WithTimeout(context.Background(), drainTimeout)
	defer cancel()
	if err := httpServer.Shutdown(drainCtx); err != nil {
		return fmt.Errorf("gateway: shutdown: %w", err)
	}
	if closeErr != nil {
		return fmt.Errorf("gateway: close: %w", closeErr)
	}
	logger.Info("gateway stopped")
	return nil
}

func loadOptions() (gateway.Options, error) {
	var opts gateway.Options
	var err error

	if opts.MaxRelays, err = envInt("GATEWAY_MAX_RELAYS"); err != nil {
		return opts, err
	}
	if opts.MaxClients, err = envInt("GATEWAY_MAX_CLIENTS"); err != nil {
		return opts, err
	}
	if opts.MaxClientsPerRelay, err = envInt("GATEWAY_MAX_CLIENTS_PER_RELAY"); err != nil {
		return opts, err
	}
	if opts.ConnectRatePerMinute, err = envInt("GATEWAY_CONNECT_RATE_PER_MINUTE"); err != nil {
		return opts, err
	}
	if opts.QuotaWarnPercent, err = envInt("GATEWAY_QUOTA_WARN_PERCENT"); err != nil {
		return opts, err
	}

	// LERDR_GATEWAY_MONTHLY_BYTES=0 means unlimited, which Options spells as a
	// negative limit because zero selects the default there.
	monthly, set, err := envInt64("GATEWAY_MONTHLY_BYTES")
	if err != nil {
		return opts, err
	}
	if set {
		opts.MonthlyBytes = monthly
		if monthly == 0 {
			opts.MonthlyBytes = -1
		}
	}

	idleSeconds, err := envInt("GATEWAY_IDLE_TIMEOUT")
	if err != nil {
		return opts, err
	}
	if idleSeconds < 0 {
		opts.IdleTimeout = -1
	} else {
		opts.IdleTimeout = time.Duration(idleSeconds) * time.Second
	}

	opts.StatePath = envString("GATEWAY_STATE", "")
	// Address discovery listens on its own UDP port. gateway.Options treats an
	// empty address as disabled, so the ":3478" default lives here — and unlike
	// every other string variable an explicitly empty value is meaningful, since
	// setting LERDR_GATEWAY_STUN_ADDR= is how an operator who cannot open UDP
	// switches discovery off. envString folds empty into its fallback, so this
	// reads the variable directly.
	opts.STUNAddr = ":3478"
	if raw, ok := gatewayEnv("GATEWAY_STUN_ADDR"); ok {
		opts.STUNAddr = strings.TrimSpace(raw)
	}
	if opts.TrustProxyHeaders, err = envBool("GATEWAY_TRUSTED_PROXY"); err != nil {
		return opts, err
	}
	opts.Version = version
	opts.Revision = revision
	return opts, nil
}

func newLogger(format string) (*slog.Logger, error) {
	options := &slog.HandlerOptions{Level: slog.LevelInfo}
	switch format {
	case "text":
		return slog.New(slog.NewTextHandler(os.Stderr, options)), nil
	case "json":
		return slog.New(slog.NewJSONHandler(os.Stderr, options)), nil
	default:
		return nil, fmt.Errorf("gateway: LERDR_GATEWAY_LOG_FORMAT must be text or json, got %q", format)
	}
}

// gatewayEnv resolves a configuration variable by suffix: LERDR_<key> first,
// then the HERDR_<key> spelling a pre-rename deployment may still set.
func gatewayEnv(key string) (string, bool) {
	if value, ok := os.LookupEnv("LERDR_" + key); ok {
		return value, true
	}
	return os.LookupEnv("HERDR_" + key)
}

func envString(key, fallback string) string {
	if value, ok := gatewayEnv(key); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

// envInt returns zero when the variable is unset, letting gateway.Options apply
// its own default.
func envInt(key string) (int, error) {
	raw, ok := gatewayEnv(key)
	raw = strings.TrimSpace(raw)
	if !ok || raw == "" {
		return 0, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("gateway: LERDR_%s must be an integer, got %q", key, raw)
	}
	return value, nil
}

func envInt64(key string) (int64, bool, error) {
	raw, ok := gatewayEnv(key)
	raw = strings.TrimSpace(raw)
	if !ok || raw == "" {
		return 0, false, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, false, fmt.Errorf("gateway: LERDR_%s must be an integer, got %q", key, raw)
	}
	return value, true, nil
}

func envBool(key string) (bool, error) {
	raw, ok := gatewayEnv(key)
	raw = strings.TrimSpace(raw)
	if !ok || raw == "" {
		return false, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("gateway: LERDR_%s must be a boolean, got %q", key, raw)
	}
	return value, nil
}
