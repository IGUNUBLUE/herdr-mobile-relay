import { isNativeShell, nativeHaptic } from './native';

/**
 * One-tap tactile confirmation for deliberate actions (send, approve, deny).
 * Inside the Tauri shell the haptics plugin drives real hardware feedback;
 * elsewhere navigator.vibrate covers supporting browsers — and every other
 * platform simply no-ops. The call never throws into the action handler.
 */
export function haptic(pattern: number | number[] = 12): void {
  if (isNativeShell()) {
    // Fire-and-forget: tap feedback must not await IPC.
    void nativeHaptic(pattern);
    return;
  }
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers expose vibrate() but reject it outside user gestures.
  }
}
