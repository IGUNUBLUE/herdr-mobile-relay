import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeNotification } from '$lib/native';
import {
  createRelayStatusNotifier,
  RELAY_DISCONNECT_NOTIFY_DELAY_MS,
  relayStatusNotificationId,
} from '$lib/relay-status-notify';

function harness(enabled: () => boolean = () => true) {
  const posted: NativeNotification[] = [];
  const notifier = createRelayStatusNotifier({
    notify: (notification) => { posted.push(notification); },
    enabled,
  });
  return { notifier, posted };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('relay status notifier', () => {
  it('stays silent when the relay reconnects inside the flap window', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS - 1);
    notifier.sync('relay-a', 'connected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);
  });

  it('stays silent across a connecting intermediate hop inside the window', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    vi.advanceTimersByTime(3_000);
    notifier.sync('relay-a', 'connecting', 'Laptop');
    vi.advanceTimersByTime(2_000);
    notifier.sync('relay-a', 'connected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);
  });

  it('posts a single deduplicated alert once the outage outlives the window', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS);
    expect(posted).toEqual([{
      title: 'Laptop disconnected',
      id: relayStatusNotificationId('relay-a'),
      channelId: 'relay-status',
      silent: true,
      autoCancel: true,
    }]);
    // Repeated disconnected syncs while the alert is up must not stack.
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toHaveLength(1);
  });

  it('updates the same notification id to reconnected after a posted outage', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS);
    notifier.sync('relay-a', 'connected', 'Laptop');
    expect(posted).toHaveLength(2);
    expect(posted[1]).toMatchObject({
      title: 'Laptop reconnected',
      id: posted[0].id,
      channelId: 'relay-status',
      silent: true,
      autoCancel: true,
    });
  });

  it('posts nothing for a plain connect with no preceding outage', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connecting', 'Laptop');
    notifier.sync('relay-a', 'connected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);
  });

  it('ignores the first observed status instead of alerting on it', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);
  });

  it('keeps timers and ids independent per relay', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-b', 'connected', 'Desktop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    notifier.sync('relay-b', 'disconnected', 'Desktop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS / 2);
    notifier.sync('relay-b', 'connected', 'Desktop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS);
    expect(posted).toEqual([
      expect.objectContaining({ title: 'Laptop disconnected', id: relayStatusNotificationId('relay-a') }),
    ]);
    notifier.sync('relay-a', 'connected', 'Laptop');
    expect(posted[1]).toMatchObject({ title: 'Laptop reconnected', id: relayStatusNotificationId('relay-a') });
  });

  it('cancels an armed timer when the relay disappears from the map', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    notifier.retain([]);
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);
  });

  it('clears armed timers on dispose', () => {
    const { notifier, posted } = harness();
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    notifier.dispose();
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);
  });

  it('posts nothing while the preference is off, including mid-window', () => {
    let enabled = false;
    const { notifier, posted } = harness(() => enabled);
    notifier.sync('relay-a', 'connected', 'Laptop');
    notifier.sync('relay-a', 'disconnected', 'Laptop');
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);

    enabled = true;
    notifier.sync('relay-a', 'connected', 'Laptop');
    expect(posted).toEqual([]);

    notifier.sync('relay-a', 'disconnected', 'Laptop');
    enabled = false;
    vi.advanceTimersByTime(RELAY_DISCONNECT_NOTIFY_DELAY_MS * 2);
    expect(posted).toEqual([]);
  });

  it('derives stable positive notification ids per relay', () => {
    const first = relayStatusNotificationId('relay-a');
    expect(first).toBe(relayStatusNotificationId('relay-a'));
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThan(0);
    expect(relayStatusNotificationId('relay-b')).not.toBe(first);
  });
});
