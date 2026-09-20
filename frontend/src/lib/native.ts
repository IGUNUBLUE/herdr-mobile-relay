/**
 * Bridge to the native Tauri shell. When the web app runs inside the
 * Android/desktop WebView produced by src-tauri, `withGlobalTauri` exposes
 * plugin modules on window.__TAURI__ — no npm SDK required. Every helper
 * no-ops on a plain browser so the PWA path is untouched.
 */

interface TauriNotificationApi {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<'granted' | 'denied' | 'default'>;
  notify(options: { title: string; body?: string }): void;
}

interface TauriGlobal {
  notification?: TauriNotificationApi;
}

function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  return candidate ?? null;
}

export function isNativeShell(): boolean {
  return tauri() !== null;
}

/**
 * Posts a local notification through the native shell. Returns true when the
 * notification was handed to the OS, false when there is no shell or the
 * permission was declined — callers fall back to their web path then.
 */
export async function nativeNotify(title: string, body: string): Promise<boolean> {
  const notification = tauri()?.notification;
  if (!notification) return false;
  try {
    let granted = await notification.isPermissionGranted();
    if (!granted) granted = (await notification.requestPermission()) === 'granted';
    if (!granted) return false;
    notification.notify({ title, body });
    return true;
  } catch {
    return false;
  }
}
