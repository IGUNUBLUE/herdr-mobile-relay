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

/**
 * Posts a local notification through the shell's notification plugin.
 * Returns true when the notification reached the OS; false when there is no
 * shell or permission was declined — callers keep their web fallback.
 */
export async function nativeNotify(title: string, body: string): Promise<boolean> {
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
    await invoke('plugin:notification|notify', { options: { title, body } });
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
