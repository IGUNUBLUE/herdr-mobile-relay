import { describe, expect, it } from 'vitest';
import {
  importQuickSetup,
  loadRelayConfigs,
  normalizeRelayConfig,
  quickSetupConfig,
  quickSetupInvitation,
  shouldDeferPairingConnection,
  shouldRetainSetupFragment,
  saveRelayConfigs,
} from '$lib/config';

const TOKEN = '0123456789abcdef0123456789abcdef';

/** A setup link as the relay prints it: everything secret stays in the fragment. */
function setupLink(fragment: string): Pick<Location, 'hash' | 'protocol' | 'host'> {
  return { hash: `#setup=${TOKEN}&${fragment}`, protocol: 'https:', host: 'app.example.com' };
}

describe('Home Screen setup handoff', () => {
  it('retains a valid setup fragment only in an iOS browser tab', () => {
    const locationValue = setupLink('label=Fedora&relay=wss%3A%2F%2Frelay.example.com');
    expect(shouldRetainSetupFragment(locationValue, false)).toBe(true);
    expect(shouldRetainSetupFragment(locationValue, true)).toBe(false);
    expect(shouldRetainSetupFragment(locationValue, undefined)).toBe(false);
    expect(shouldRetainSetupFragment({
      ...locationValue,
      hash: '#setup=short',
    }, false)).toBe(false);
  });

  it('defers one-use pairing secrets until the iOS Home Screen app opens', () => {
    const invitation = {
      ...setupLink('label=Fedora&relay=wss%3A%2F%2Frelay.example.com'),
      hash: `#setup=${'A'.repeat(43)}&invite=${'B'.repeat(24)}&invite_version=1&invite_expires=2000000000000`,
    };
    expect(shouldDeferPairingConnection(invitation, false, 'Mozilla/5.0 (iPhone)', 0)).toBe(true);
    expect(shouldDeferPairingConnection(invitation, false, 'Mozilla/5.0 (Macintosh)', 5)).toBe(true);
    expect(shouldDeferPairingConnection(invitation, true, 'Mozilla/5.0 (iPhone)', 0)).toBe(false);
    expect(shouldDeferPairingConnection(invitation, false, 'Mozilla/5.0 (Android)', 5)).toBe(false);

    // The bootstrap relay key printed by setup is one-use as well: a tab that
    // redeems it leaves the installed copy with a spent link.
    const bootstrap = setupLink('label=Fedora&relay=wss%3A%2F%2Frelay.example.com');
    expect(shouldDeferPairingConnection(bootstrap, false, 'Mozilla/5.0 (iPhone)', 0)).toBe(true);
    expect(shouldDeferPairingConnection(bootstrap, false, 'Mozilla/5.0 (iPad)', 0)).toBe(true);
    expect(shouldDeferPairingConnection(bootstrap, true, 'Mozilla/5.0 (iPhone)', 0)).toBe(false);
    expect(shouldDeferPairingConnection(bootstrap, false, 'Mozilla/5.0 (Android)', 5)).toBe(false);
    expect(shouldDeferPairingConnection({ ...bootstrap, hash: '#label=Fedora' }, false, 'Mozilla/5.0 (iPhone)', 0)).toBe(false);
  });
});
describe('device invitation setup', () => {
  it('imports a one-use invitation without retaining its secret as a relay token', () => {
    const secret = 'A'.repeat(43);
    const locationValue = {
      hash: `#setup=${secret}&invite=${'B'.repeat(24)}&invite_version=2&invite_expires=2000000000000&label=Phone&relay=wss%3A%2F%2Frelay.example.com`,
      protocol: 'https:',
      host: 'app.example.com',
    };
    expect(quickSetupInvitation(locationValue)).toEqual({
      id: 'B'.repeat(24),
      version: 2,
      secret,
      expiresAt: 2_000_000_000_000,
    });
    expect(quickSetupConfig(locationValue)).toEqual({
      label: 'Phone',
      url: 'wss://relay.example.com',
      token: '',
    });
  });

  it('preserves the stored relay token when importing an invitation', () => {
    const existing = normalizeRelayConfig({
      label: 'Phone',
      url: 'wss://old-relay.example.com',
      token: TOKEN,
    });
    const locationValue = {
      hash: `#setup=${'A'.repeat(43)}&invite=${'B'.repeat(24)}&invite_version=2&invite_expires=2000000000000&label=Phone&relay=wss%3A%2F%2Fold-relay.example.com`,
      protocol: 'https:',
      host: 'app.example.com',
    };

    expect(importQuickSetup([existing], locationValue)?.[0]).toMatchObject({
      id: existing.id,
      token: TOKEN,
      paired: true,
    });
  });

  it('rejects malformed invitation selectors', () => {
    expect(quickSetupInvitation({
      hash: `#setup=${'A'.repeat(43)}&invite=short&invite_version=1&invite_expires=2000000000000`,
    })).toBeNull();
  });

  it('rejects links for the retired gateway transport', () => {
    expect(quickSetupConfig(setupLink(
      'label=Fedora&gateway=wss%3A%2F%2Fgw.example.com',
    ))).toBeNull();
    expect(quickSetupConfig(setupLink(
      'label=Fedora&gateways=wss%3A%2F%2Fa.example,wss%3A%2F%2Fb.example',
    ))).toBeNull();
  });
});


describe('relay addresses', () => {
  it('normalizes a stored entry down to its direct address', () => {
    // Legacy entries carried retired transport fields; load-time
    // normalization drops them rather than reviving a dead path.
    const stored = normalizeRelayConfig({ label: 'Fedora', url: 'wss://gw.example.com/', token: TOKEN });
    expect(stored).toEqual({
      id: 'fedora-wss-gw-example-com',
      label: 'Fedora',
      url: 'wss://gw.example.com/',
      token: TOKEN,
    });

    saveRelayConfigs([stored]);
    expect(loadRelayConfigs()).toEqual([stored]);
  });

  it('updates a paired computer whose relay address changed', () => {
    const paired = importQuickSetup([], setupLink(
      'label=Fedora&relay=wss%3A%2F%2Fa.example',
    ));
    expect(paired).toHaveLength(1);

    // The relay moved to a new tailnet hostname. The stored entry follows
    // the same relay key instead of pairing itself twice.
    const repaired = importQuickSetup(paired!, setupLink(
      'label=Fedora&relay=wss%3A%2F%2Fb.example',
    ));
    expect(repaired).toHaveLength(1);
    expect(repaired?.[0].id).toBe(paired?.[0].id);
    expect(repaired?.[0].url).toBe('wss://b.example');
  });

  it('follows a relay to a new hostname by relay key', () => {
    const paired = importQuickSetup([], setupLink('label=cv&relay=wss%3A%2F%2Fold-host.tailnet-name.ts.net'));
    expect(paired).toHaveLength(1);

    // The relay restarted: same persistent key, brand-new hostname.
    // The stored entry follows the relay so the device credential enrolled
    // under its id keeps authenticating - the one-use bootstrap invitation is
    // consumed and could never enroll this phone a second time.
    const moved = importQuickSetup(paired!, setupLink('label=cv&relay=wss%3A%2F%2Fnew-host.tailnet-name.ts.net'));
    expect(moved).toHaveLength(1);
    expect(moved?.[0].id).toBe(paired?.[0].id);
    expect(moved?.[0].url).toBe('wss://new-host.tailnet-name.ts.net');

    // A different computer's link carries a different key and pairs separately.
    const other = importQuickSetup(moved!, {
      hash: `#setup=${'f'.repeat(32)}&label=mac&relay=wss%3A%2F%2Fmac-host.tailnet-name.ts.net`,
      protocol: 'https:',
      host: 'app.example.com',
    });
    expect(other).toHaveLength(2);
  });

  it('parses the fragment the relay actually emits', () => {
    // The producer of this string is relay/setup-link.sh: a `relay=` direct
    // WebSocket URL, the label and the bootstrap key in the fragment.
    const setup = quickSetupConfig(setupLink(
      'label=cv&relay=wss%3A%2F%2Fhost.tailnet-name.ts.net',
    ));
    expect(setup).toEqual({
      label: 'cv',
      url: 'wss://host.tailnet-name.ts.net',
      token: TOKEN,
    });
  });
});
