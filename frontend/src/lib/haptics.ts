/**
 * One-tap tactile confirmation for deliberate actions (send, approve, deny).
 * Inside the Tauri shell the haptics plugin drives real hardware feedback;
 * elsewhere navigator.vibrate covers supporting browsers — and every other
 * platform simply no-ops. The call never throws into the action handler.
 */

interface TauriHaptics {
  vibrate?(options: { duration: number }): void;
}

export function haptic(pattern: number | number[] = 12): void {
  try {
    const native = (window as unknown as { __TAURI__?: { haptics?: TauriHaptics } })
      .__TAURI__?.haptics;
    if (native?.vibrate) {
      // The plugin takes a single duration; a deny-style [a, gap, b] pattern
      // collapses to its summed buzz so the distinction survives.
      const duration = Array.isArray(pattern)
        ? pattern.reduce((sum, ms) => sum + ms, 0)
        : pattern;
      native.vibrate({ duration });
      return;
    }
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers expose vibrate() but reject it outside user gestures.
  }
}
