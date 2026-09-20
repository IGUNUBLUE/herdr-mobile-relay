import { relayStore } from './store';

export type SetupLinkImport = 'empty' | 'invalid' | 'no-invite' | 'ok';

/**
 * A scanned QR or pasted setup link is just an http(s) URL whose #fragment
 * carries the pairing data — hand the parsed parts to the same import path
 * the browser's location would feed on load.
 */
export function importSetupLinkText(text: string | null): SetupLinkImport {
  if (!text?.trim()) return 'empty';
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return 'invalid';
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hash) return 'invalid';
  return relayStore.importSetupLink({
    hash: url.hash,
    protocol: url.protocol,
    host: url.host,
    pathname: url.pathname,
    search: url.search,
  }) ? 'ok' : 'no-invite';
}

export function setupLinkToast(result: SetupLinkImport): string | null {
  switch (result) {
    case 'ok': return null;
    case 'empty': return 'Nothing to import.';
    case 'invalid': return 'That is not a valid setup link.';
    case 'no-invite': return 'That link does not carry a setup invitation.';
  }
}
