/**
 * One-tap tactile confirmation for deliberate actions (send, approve, deny).
 * Vibration is a progressive enhancement: unsupported platforms and desktop
 * browsers simply no-op, and the call never throws into the action handler.
 */
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers expose vibrate() but reject it outside user gestures.
  }
}
