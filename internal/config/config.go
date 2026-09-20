package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

// Accepted LERDR_GATEWAY_SELECTION values.
const (
	// GatewaySelectionOrdered registers with the first healthy entry in
	// configured order: an explicit list is a priority, not a preference.
	GatewaySelectionOrdered = "ordered"
	// GatewaySelectionLatency ranks healthy entries by measured round trip. It
	// only fits interchangeable endpoints, such as the community gateway list.
	GatewaySelectionLatency = "latency"
)

type Config struct {
	Host           string
	Port           int
	PluginPort     int
	Token          string
	InstanceID     string
	AllowedOrigins []string
	WebRoot        string
	HerdrBin       string
	SocketPath     string
	PollInterval   float64
	RuntimeDir     string
	LogFormat      string
	LogLevel       slog.Level
	ReleaseRoot    string
	ServiceName    string

	// GatewayURL is the configured tie-break leader, kept equal to
	// GatewayURLs[0] so readers that only know one gateway keep working. The
	// transport may select another healthy entry at runtime.
	GatewayURL  string
	GatewayURLs []string
	// GatewaySelection is how the transport picks among GatewayURLs: "ordered"
	// registers with the first healthy entry in configured order, "latency"
	// with the lowest-latency healthy one. The loader normalises it, so no
	// reader validates it again.
	GatewaySelection    string
	WebRTCUDPPort       int
	ForceRelayTransport bool
	PortMappingEnabled  bool
	// RearmBootstrap starts every process with an empty device list and a fresh
	// one-use bootstrap invitation. Only the quick-tunnel flow sets it: its app
	// origin changes each launch, so no enrolled credential can be presented again.
	RearmBootstrap bool

	CacheDir   string
	ConfigHome string
	DataHome   string
}

func Load() (*Config, error) {
	cfg := &Config{
		Host:         relayEnvOr("RELAY_HOST", "127.0.0.1"),
		Port:         relayEnvIntOr("RELAY_PORT", 8375),
		PluginPort:   relayEnvIntOr("RELAY_PLUGIN_PORT", 8376),
		Token:        relayEnv("RELAY_TOKEN"),
		InstanceID:   relayEnv("RELAY_INSTANCE_ID"),
		WebRoot:      relayEnv("WEB_ROOT"),
		HerdrBin:     os.Getenv("HERDR_BIN"),
		SocketPath:   os.Getenv("HERDR_SOCKET_PATH"),
		PollInterval: relayEnvFloatOr("RELAY_POLL_INTERVAL", 2.0),
		LogFormat:    relayEnvOr("RELAY_LOG_FORMAT", "text"),
		ServiceName:  relayEnvOr("RELAY_SERVICE_NAME", defaultServiceName()),

		WebRTCUDPPort:       relayEnvIntOr("WEBRTC_UDP_PORT", 0),
		ForceRelayTransport: relayEnvBoolOr("TRANSPORT_FORCE_RELAY", false),
		PortMappingEnabled:  relayEnvBoolOr("REACHABILITY_PORT_MAPPING", true),
		RearmBootstrap:      relayEnvBoolOr("RELAY_REARM_BOOTSTRAP", false),
	}

	logLevel, err := parseLogLevel(relayEnv("RELAY_LOG_LEVEL"))
	if err != nil {
		return nil, err
	}
	cfg.LogLevel = logLevel

	if origins := relayEnv("ALLOWED_ORIGINS"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if trimmed := strings.TrimSpace(o); trimmed != "" {
				cfg.AllowedOrigins = append(cfg.AllowedOrigins, trimmed)
			}
		}
	}

	// LERDR_GATEWAY_URL is an ordered candidate list. The relay probes the
	// entries concurrently; LERDR_GATEWAY_SELECTION decides what the order
	// means. A single value is one entry and behaves exactly as it always did.
	cfg.GatewayURLs = parseGatewayURLs(relayEnv("GATEWAY_URL"))
	if len(cfg.GatewayURLs) > 0 {
		cfg.GatewayURL = cfg.GatewayURLs[0]
	}
	cfg.GatewaySelection = parseGatewaySelection(relayEnv("GATEWAY_SELECTION"))

	cfg.ConfigHome = envOr("XDG_CONFIG_HOME", filepath.Join(homeDir(), ".config"))
	cacheHome := envOr("XDG_CACHE_HOME", filepath.Join(homeDir(), ".cache"))
	cfg.DataHome = envOr("XDG_DATA_HOME", filepath.Join(homeDir(), ".local", "share"))
	cfg.ReleaseRoot = relayEnv("RELEASE_ROOT")
	if cfg.ReleaseRoot == "" {
		cfg.ReleaseRoot = installedReleaseRoot()
	}
	if cfg.ReleaseRoot == "" {
		cfg.ReleaseRoot = adoptLegacyDir(
			filepath.Join(cfg.DataHome, "lerdr"),
			filepath.Join(cfg.DataHome, "herdr-mobile-relay"),
		)
	}

	if cfg.SocketPath == "" {
		cfg.SocketPath = filepath.Join(cfg.ConfigHome, "herdr", "herdr.sock")
	}

	cfg.RuntimeDir = resolveRuntimeDir(cfg.ConfigHome)
	cfg.CacheDir = adoptLegacyDir(
		filepath.Join(cacheHome, "lerdr"),
		filepath.Join(cacheHome, "herdr-mobile-relay"),
	)

	if cfg.WebRoot == "" {
		cfg.WebRoot = defaultWebRoot()
	}

	if cfg.HerdrBin == "" {
		cfg.HerdrBin = findHerdrBin()
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) Addr() string {
	return net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
}

func (c *Config) validate() error {
	if c.Token == "" && c.Host != "127.0.0.1" && c.Host != "::1" && c.Host != "localhost" {
		return fmt.Errorf("refusing to bind tokenless relay to non-loopback address %s", c.Host)
	}
	if c.Token != "" && len(c.Token) != 32 {
		return errors.New("relay key must be exactly 32 bytes")
	}
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("invalid port %d", c.Port)
	}
	for _, gateway := range c.GatewayURLs {
		parsed, err := url.Parse(gateway)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "ws" && parsed.Scheme != "wss") {
			return fmt.Errorf("invalid gateway url %q: want ws:// or wss:// base url", gateway)
		}
	}
	if len(c.GatewayURLs) > 0 && c.Token == "" {
		return fmt.Errorf("gateway url requires a relay key: the gateway path derives its credentials from it")
	}
	return nil
}

func resolveRuntimeDir(configHome string) string {
	if env := relayEnv("RELAY_ENV"); env != "" {
		return filepath.Dir(env)
	}
	if dir := os.Getenv("HERDR_PLUGIN_CONFIG_DIR"); dir != "" {
		return dir
	}
	return adoptLegacyDir(
		filepath.Join(configHome, "lerdr"),
		filepath.Join(configHome, "herdr-mobile-relay"),
	)
}

func defaultWebRoot() string {
	exe, err := os.Executable()
	if err != nil {
		return "web"
	}
	if root := installedReleaseRoot(); root != "" {
		if resolved, resolveErr := filepath.EvalSymlinks(exe); resolveErr == nil {
			return filepath.Join(filepath.Dir(resolved), "web")
		}
		return filepath.Join(filepath.Dir(exe), "web")
	}
	return filepath.Join(filepath.Dir(filepath.Dir(exe)), "web")
}

func installedReleaseRoot() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		resolved = exe
	}
	releaseDir := filepath.Dir(resolved)
	releasesDir := filepath.Dir(releaseDir)
	if filepath.Base(releasesDir) != "releases" {
		return ""
	}
	root := filepath.Dir(releasesDir)
	current := filepath.Join(root, "current")
	if _, err := os.Lstat(current); err != nil {
		return ""
	}
	return root
}

func defaultServiceName() string {
	if runtime.GOOS == "darwin" {
		return "com.lerdr.service"
	}
	return "lerdr.service"
}

// adoptLegacyDir returns legacy when the renamed directory does not exist yet
// but a pre-rename install left one behind. The installer migrates the data;
// this only keeps an unmigrated install reachable until then.
func adoptLegacyDir(dir, legacy string) string {
	if _, err := os.Stat(dir); err == nil {
		return dir
	}
	if _, err := os.Stat(legacy); err == nil {
		return legacy
	}
	return dir
}

func findHerdrBin() string {
	candidates := []string{
		filepath.Join(homeDir(), ".local", "bin", "herdr"),
		"/opt/homebrew/bin/herdr",
		"/usr/local/bin/herdr",
		"/home/linuxbrew/.linuxbrew/bin/herdr",
		"/home/linuxbrew/.linuxbrew/opt/herdr/bin/herdr",
	}
	if p, err := lookPath("herdr"); err == nil {
		return p
	}
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c
		}
	}
	return "herdr"
}

func lookPath(name string) (string, error) {
	pathEnv := os.Getenv("PATH")
	for _, dir := range filepath.SplitList(pathEnv) {
		p := filepath.Join(dir, name)
		if info, err := os.Stat(p); err == nil && !info.IsDir() && info.Mode()&0111 != 0 {
			return p, nil
		}
	}
	return "", fmt.Errorf("%s not found in PATH", name)
}

func homeDir() string {
	h, err := os.UserHomeDir()
	if err != nil {
		return "/tmp"
	}
	return h
}

// parseGatewayURLs splits the ordered gateway list. Empty entries are dropped
// so a trailing comma or a stray space in a hand-edited env file configures a
// working relay instead of a phantom gateway.
func parseGatewayURLs(raw string) []string {
	var urls []string
	for _, entry := range strings.Split(raw, ",") {
		if trimmed := strings.TrimRight(strings.TrimSpace(entry), "/"); trimmed != "" {
			urls = append(urls, trimmed)
		}
	}
	return urls
}

// parseGatewaySelection normalises the selection rule. Only the community
// gateway list is a set of interchangeable endpoints where latency ranking is
// the point; a hand-listed gateway is a choice the relay must honour, so
// absent, empty and unrecognised values all mean configured order.
func parseGatewaySelection(raw string) string {
	if strings.ToLower(strings.TrimSpace(raw)) == GatewaySelectionLatency {
		return GatewaySelectionLatency
	}
	return GatewaySelectionOrdered
}

func parseLogLevel(raw string) (slog.Level, error) {
	switch normalized := strings.ToLower(strings.TrimSpace(raw)); normalized {
	case "", "info":
		return slog.LevelInfo, nil
	case "debug":
		return slog.LevelDebug, nil
	case "warn":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("invalid LERDR_RELAY_LOG_LEVEL %q: want debug, info, warn, or error", raw)
	}
}

// relayEnv reads a relay configuration variable: LERDR_<key> first, then the
// HERDR_<key> spelling a pre-rename service file or operator shell may still
// set. Variables the host process itself injects (HERDR_BIN, HERDR_SOCKET_PATH,
// HERDR_PLUGIN_CONFIG_DIR) are read directly, not through here.
func relayEnv(key string) string {
	if v := os.Getenv("LERDR_" + key); v != "" {
		return v
	}
	return os.Getenv("HERDR_" + key)
}

func relayEnvOr(key, fallback string) string {
	if v := relayEnv(key); v != "" {
		return v
	}
	return fallback
}

func relayEnvIntOr(key string, fallback int) int {
	if v := relayEnv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func relayEnvBoolOr(key string, fallback bool) bool {
	if v := relayEnv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func relayEnvFloatOr(key string, fallback float64) float64 {
	if v := relayEnv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envBoolOr(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func envFloatOr(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}
