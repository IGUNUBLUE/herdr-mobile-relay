/**
 * Bridge to the native Tauri shell. `withGlobalTauri` exposes the core API on
 * window.__TAURI__ — plugin commands ride the same IPC router as
 * `plugin:<name>|<command>` (snake_case), so no npm SDK is required. Every
 * helper no-ops in a plain browser, keeping the PWA path untouched.
 */

interface TauriCore {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

function tauriInvoke(): TauriCore['invoke'] | null {
  if (typeof window === 'undefined') return null;
  const core = (window as unknown as { __TAURI__?: { core?: TauriCore } })
    .__TAURI__?.core;
  return core?.invoke ? core.invoke.bind(core) : null;
}

export function isNativeShell(): boolean {
  return tauriInvoke() !== null;
}

/** Android notification channels registered by the shell at startup. */
export type NativeNotifyChannel =
  | 'agents-attention'
  | 'agents-finished'
  | 'relay-status';

export interface NativeNotification {
  title: string;
  body?: string;
  channelId?: NativeNotifyChannel;
  /** Bundles alerts under one shade entry; paired with a summary id. */
  group?: string;
  groupSummary?: boolean;
  /** Inbox-style extra lines shown on expansion. */
  inboxLines?: string[];
  /** Stable id so a repeat alert replaces instead of stacking. */
  id?: number;
  silent?: boolean;
}

/** Reads the OS notification permission without prompting. */
export async function nativeNotificationPermissionState(): Promise<'granted' | 'prompt' | 'denied' | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  try {
    const granted = await invoke<boolean | null>(
      'plugin:notification|is_permission_granted',
    );
    if (granted === true) return 'granted';
    if (granted === false) return 'denied';
    return 'prompt';
  } catch {
    return null;
  }
}

/** Prompts for the OS notification permission; resolves with the outcome. */
export async function requestNativeNotificationPermission(): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  try {
    const state = await invoke<string>('plugin:notification|request_permission');
    return state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Posts a local notification through the shell's notification plugin.
 * Returns true when the notification reached the OS; false when there is no
 * shell or permission was declined — callers keep their web fallback.
 */
export async function nativeNotify(
  notification: NativeNotification,
): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  try {
    // Option<bool>: null means the state is still "prompt" — request it.
    let granted = await invoke<boolean | null>(
      'plugin:notification|is_permission_granted',
    );
    if (granted !== true) {
      const state = await invoke<string>('plugin:notification|request_permission');
      granted = state === 'granted';
    }
    if (!granted) return false;
    const { title, ...rest } = notification;
    await invoke('plugin:notification|notify', {
      options: { title, ...rest },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Hardware haptic via the haptics plugin. Patterns collapse to their summed
 * duration — the plugin's vibrate takes a single duration. Returns whether a
 * native buzz was delivered.
 */
export async function nativeHaptic(pattern: number | number[] = 12): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  const duration = Array.isArray(pattern)
    ? pattern.reduce((sum, ms) => sum + ms, 0)
    : pattern;
  try {
    await invoke('plugin:haptics|vibrate', { duration });
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the in-app camera scanner and resolves with the QR contents. Null on
 * cancel, denial, or outside the shell — callers fall back to paste/manual.
 * The plugin does not ask for CAMERA itself: check → request → scan.
 */
export async function scanQrCode(): Promise<string | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  try {
    let camera = (await invoke<{ camera?: string }>(
      'plugin:barcode-scanner|check_permissions',
    ))?.camera;
    if (camera !== 'granted') {
      camera = (await invoke<{ camera?: string }>(
        'plugin:barcode-scanner|request_permissions',
      ))?.camera;
    }
    if (camera !== 'granted') return null;
    const result = await invoke<{ content?: string }>(
      'plugin:barcode-scanner|scan',
      { formats: ['QR_CODE'], windowed: false },
    );
    return result?.content || null;
  } catch {
    return null;
  }
}

/** System clipboard text, or null when empty/unavailable/off the shell. */
export async function readClipboardText(): Promise<string | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  try {
    // The plugin returns the raw string; keep the object shape tolerated in
    // case a plugin version wraps it.
    const result = await invoke<string | { text?: string }>(
      'plugin:clipboard-manager|read_text',
    );
    if (typeof result === 'string') return result || null;
    return result?.text || null;
  } catch {
    return null;
  }
}

export async function writeClipboardText(text: string): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  try {
    await invoke('plugin:clipboard-manager|write_text', { text });
    return true;
  } catch {
    return false;
  }
}

/** Whether the device can answer a biometric prompt right now. */
export async function biometricAvailable(): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  try {
    const status = await invoke<{ isAvailable?: boolean }>(
      'plugin:biometric|status',
    );
    return status?.isAvailable === true;
  } catch {
    return false;
  }
}

/**
 * Shows the system biometric prompt (fingerprint/face, device credential
 * fallback allowed). Resolves true on success; false on cancel/failure —
 * never throws, so the lock screen can retry safely.
 */
export async function authenticateBiometric(reason: string): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  try {
    await invoke('plugin:biometric|authenticate', {
      reason,
      title: 'Lerdr',
      allowDeviceCredential: true,
      confirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}
