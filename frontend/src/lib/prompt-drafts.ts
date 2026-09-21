import type { Agent } from './types';

const DRAFT_PREFIX = 'lerdr_prompt_draft_v1:';
const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1_000;
const DRAFT_MAX_BYTES = 64 * 1_024;
const DRAFT_MAX_ENTRIES = 64;

interface PromptDraftRecord {
  version: number;
  identity: string;
  text: string;
  updatedAt: number;
}

/**
 * Newest live value per pane identity. Oversize drafts and drafts written
 * while storage is unavailable never reach localStorage, so this tier is what
 * keeps them alive across the remount a pane switch performs. Bounded like the
 * persisted set; lost on reload, which the composer warning states.
 */
const memoryDrafts = new Map<string, { text: string; updatedAt: number }>();

function readMemoryDraft(identity: string, now: number): string {
  const draft = memoryDrafts.get(identity);
  if (!draft) return '';
  if (now - draft.updatedAt > DRAFT_MAX_AGE_MS) {
    memoryDrafts.delete(identity);
    return '';
  }
  return draft.text;
}

function writeMemoryDraft(identity: string, text: string, updatedAt: number): void {
  memoryDrafts.delete(identity);
  memoryDrafts.set(identity, { text, updatedAt });
  while (memoryDrafts.size > DRAFT_MAX_ENTRIES) {
    const oldest = memoryDrafts.keys().next();
    if (oldest.done) return;
    memoryDrafts.delete(oldest.value);
  }
}

export type PromptDraftSaveResult = 'saved' | 'cleared' | 'too-large' | 'unavailable';

export function promptDraftIdentity(agent: Agent): string {
  const paneIdentity = String(agent.terminal_id || [agent.workspace_id, agent.tab_id, agent.raw_pane_id].filter(Boolean).join(':'));
  return JSON.stringify([
    agent.relay_id,
    paneIdentity,
    String(agent.agent || ''),
    String(agent.cwd || ''),
  ]);
}

function promptDraftKey(identity: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(identity)}`;
}

function parseDraft(raw: string | null): PromptDraftRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PromptDraftRecord>;
    if (parsed.version !== DRAFT_VERSION
      || typeof parsed.identity !== 'string'
      || typeof parsed.text !== 'string'
      || typeof parsed.updatedAt !== 'number'
      || !Number.isFinite(parsed.updatedAt)
      || parsed.updatedAt <= 0) return null;
    return parsed as PromptDraftRecord;
  } catch {
    return null;
  }
}

export function loadPromptDraft(agent: Agent, now = Date.now()): string {
  const identity = promptDraftIdentity(agent);
  const key = promptDraftKey(identity);
  const live = readMemoryDraft(identity, now);
  if (live) return live;
  try {
    const draft = parseDraft(localStorage.getItem(key));
    if (!draft || draft.identity !== identity || now - draft.updatedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return '';
    }
    return draft.text;
  } catch {
    return '';
  }
}

export function savePromptDraft(agent: Agent, text: string, now = Date.now()): PromptDraftSaveResult {
  const identity = promptDraftIdentity(agent);
  const key = promptDraftKey(identity);
  pendingDraftWrites.delete(key);
  if (text) writeMemoryDraft(identity, text, now);
  else memoryDrafts.delete(identity);
  try {
    if (!text) {
      localStorage.removeItem(key);
      return 'cleared';
    }
    if (new TextEncoder().encode(text).byteLength > DRAFT_MAX_BYTES) {
      // An oversize draft never reaches storage, so any shorter earlier record
      // for this pane would be served back as the current draft on remount.
      localStorage.removeItem(key);
      return 'too-large';
    }
    const draft: PromptDraftRecord = { version: DRAFT_VERSION, identity, text, updatedAt: now };
    localStorage.setItem(key, JSON.stringify(draft));
    prunePromptDrafts(now);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

export function clearPromptDraft(agent: Agent): void {
  const identity = promptDraftIdentity(agent);
  memoryDrafts.delete(identity);
  pendingDraftWrites.delete(promptDraftKey(identity));
  try {
    localStorage.removeItem(promptDraftKey(identity));
  } catch {
    // Storage can be unavailable in browser private modes; the live composer still clears normally.
  }
}

export function prunePromptDrafts(now = Date.now()): string[] {
  const removed: string[] = [];
  try {
    const drafts: Array<{ key: string; updatedAt: number }> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const draft = parseDraft(localStorage.getItem(key));
      if (!draft || now - draft.updatedAt > DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(key);
        removed.push(key);
        index -= 1;
        continue;
      }
      drafts.push({ key, updatedAt: draft.updatedAt });
    }
    drafts.sort((left, right) => right.updatedAt - left.updatedAt);
    for (const draft of drafts.slice(DRAFT_MAX_ENTRIES)) {
      localStorage.removeItem(draft.key);
      removed.push(draft.key);
    }
  } catch {
    // Persistence is best-effort. The current textarea remains the source of truth.
  }
  return removed;
}

const DRAFT_SAVE_DELAY_MS = 300;

interface PendingDraftWrite {
  identity: string;
  text: string;
  updatedAt: number;
}

const pendingDraftWrites = new Map<string, PendingDraftWrite>();
const persistedDraftKeys = new Set<string>();
let persistedKeysSeeded = false;
let draftFlushTimer: ReturnType<typeof setTimeout> | undefined;
let draftFlushArmed = false;

function seedPersistedDraftKeys(): void {
  if (persistedKeysSeeded) return;
  persistedKeysSeeded = true;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(DRAFT_PREFIX)) persistedDraftKeys.add(key);
    }
  } catch {
    // A missed key only means one extra prune scan later.
  }
}

/**
 * Applies the queued draft writes. The prune scan only runs when a key is
 * genuinely new — overwriting an existing record cannot grow the set.
 */
export function flushPromptDrafts(now = Date.now()): void {
  if (draftFlushTimer) {
    clearTimeout(draftFlushTimer);
    draftFlushTimer = undefined;
  }
  const writes = [...pendingDraftWrites.values()];
  pendingDraftWrites.clear();
  if (!writes.length) return;
  try {
    seedPersistedDraftKeys();
    for (const write of writes) {
      const key = promptDraftKey(write.identity);
      const draft: PromptDraftRecord = {
        version: DRAFT_VERSION,
        identity: write.identity,
        text: write.text,
        updatedAt: write.updatedAt,
      };
      localStorage.setItem(key, JSON.stringify(draft));
      if (persistedDraftKeys.has(key)) continue;
      persistedDraftKeys.add(key);
      for (const removedKey of prunePromptDrafts(now)) persistedDraftKeys.delete(removedKey);
    }
  } catch {
    // Persistence is best-effort; the in-memory tier still serves remounts.
  }
}

/**
 * Debounced variant of savePromptDraft for per-keystroke callers. The memory
 * tier updates synchronously so pane switches still restore the draft; the
 * storage write lands after typing pauses, on hide, or on flushPromptDrafts.
 * 'saved' is optimistic — an unavailable store is dropped best-effort then.
 */
export function schedulePromptDraftSave(agent: Agent, text: string, now = Date.now()): PromptDraftSaveResult {
  const identity = promptDraftIdentity(agent);
  const key = promptDraftKey(identity);
  if (!text) {
    pendingDraftWrites.delete(key);
    memoryDrafts.delete(identity);
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in browser private modes.
    }
    return 'cleared';
  }
  writeMemoryDraft(identity, text, now);
  if (new TextEncoder().encode(text).byteLength > DRAFT_MAX_BYTES) {
    pendingDraftWrites.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in browser private modes.
    }
    return 'too-large';
  }
  pendingDraftWrites.set(key, { identity, text, updatedAt: now });
  if (draftFlushTimer) clearTimeout(draftFlushTimer);
  draftFlushTimer = setTimeout(() => flushPromptDrafts(), DRAFT_SAVE_DELAY_MS);
  if (!draftFlushArmed && typeof document !== 'undefined') {
    draftFlushArmed = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPromptDrafts();
    });
    window.addEventListener('pagehide', () => flushPromptDrafts());
  }
  return 'saved';
}
