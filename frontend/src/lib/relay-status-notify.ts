import { nativeNotify } from './native';
import type { NativeNotification } from './native';
import type { RelayStatus } from './types';

/**
 * Relay link flapping matters to an operator, but a socket that drops and
 * recovers inside a few seconds is the network doing its job, not an event
 * worth a shade entry. A drop only posts once the relay has stayed down for
 * the whole settle window, and every post reuses a per-relay notification id
 * so Android replaces the existing entry instead of stacking a new line.
 */
export const RELAY_DISCONNECT_NOTIFY_DELAY_MS = 8_000;

export interface RelayStatusNotifyHooks {
  notify(notification: NativeNotification): unknown;
  enabled(): boolean;
}

/**
 * The plugin keys shade entries by an i32 id and assigns a random one when
 * the caller omits it, so each relay gets a deterministic id in a high band —
 * repeat posts for that relay update in place rather than colliding with the
 * random ids other alerts receive.
 */
export function relayStatusNotificationId(relayId: string): number {
  let hash = 0x811c9dc5;
  for (const char of relayId) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return 0x4000_0000 | (hash & 0x3fff_ffff);
}

export function createRelayStatusNotifier(
  hooks: Partial<RelayStatusNotifyHooks> = {},
  delayMs = RELAY_DISCONNECT_NOTIFY_DELAY_MS,
) {
  const notify = hooks.notify ?? nativeNotify;
  const enabled = hooks.enabled ?? (() => true);
  const statuses = new Map<string, RelayStatus>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const posted = new Set<string>();

  function clearPending(relayId: string): void {
    const timer = pending.get(relayId);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(relayId);
  }

  function post(relayId: string, label: string, state: 'disconnected' | 'reconnected'): void {
    if (!enabled()) return;
    void notify({
      title: `${label} ${state}`,
      id: relayStatusNotificationId(relayId),
      channelId: 'relay-status',
      silent: true,
      autoCancel: true,
    });
  }

  return {
    sync(relayId: string, status: RelayStatus, label: string): void {
      const previous = statuses.get(relayId);
      statuses.set(relayId, status);
      if (previous === status) return;
      if (status === 'connected') {
        clearPending(relayId);
        // A reconnect rewrites the outage entry in place rather than adding a
        // fresh "reconnected" line: the plugin registers no cancel command,
        // so reposting the stable id is the only way to retire the alert.
        if (posted.delete(relayId)) post(relayId, label, 'reconnected');
        return;
      }
      if (status !== 'disconnected' || !previous || pending.has(relayId)) return;
      pending.set(relayId, setTimeout(() => {
        pending.delete(relayId);
        // "Still down" means no connected status arrived inside the window —
        // a retry in progress is still an outage worth reporting.
        if (statuses.get(relayId) === 'connected' || !enabled()) return;
        posted.add(relayId);
        post(relayId, label, 'disconnected');
      }, delayMs));
    },
    /** Drops state for relays no longer in the connection map so a removed
     *  relay's armed timer cannot alert after it is gone. */
    retain(relayIds: Iterable<string>): void {
      const active = new Set(relayIds);
      for (const relayId of [...pending.keys()]) {
        if (!active.has(relayId)) clearPending(relayId);
      }
      for (const relayId of [...statuses.keys()]) {
        if (!active.has(relayId)) statuses.delete(relayId);
      }
      for (const relayId of [...posted]) {
        if (!active.has(relayId)) posted.delete(relayId);
      }
    },
    dispose(): void {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      statuses.clear();
      posted.clear();
    },
  };
}
