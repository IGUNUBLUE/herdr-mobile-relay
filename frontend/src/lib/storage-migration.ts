// Copies every `herdr_*` web-storage entry to its `lerdr_*` name before the
// app reads any key, so installs upgraded from the old product name keep
// relays, prefs, drafts, and push state. Old keys stay in place: harmless to
// the new name and a working downgrade path if the user ever rolls back.
const LEGACY_PREFIX = 'herdr_';
const CURRENT_PREFIX = 'lerdr_';

export function migrateLegacyStorage(): void {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(storage)) {
        if (!key.startsWith(LEGACY_PREFIX)) continue;
        const next = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length);
        if (storage.getItem(next) === null) storage.setItem(next, storage.getItem(key) ?? '');
      }
    } catch {
      // Storage can throw under private browsing or quota pressure; the app
      // already treats every key as optional, so a skipped copy is safe.
    }
  }
}

// Run at import time: this module is imported first in main.ts so the sweep
// finishes before store.ts (or any other importer) reads a single key.
migrateLegacyStorage();
