// Shared mock-relay harness: boots the app against an in-page fake relay
// (WebSocket shim, canned handshake, push messages) so browser tests and the
// screenshot capture script drive the real UI without a live Herdr.
import { type Page } from '@playwright/test';

export interface RelayFixture {
  id: string;
  label: string;
  url: string;
  token: string;
}

export interface BootOptions {
  standalone?: boolean;
  navigatorStandalone?: boolean;
  userAgent?: string;
  largeSlashCatalog?: boolean;
}

export async function boot(page: Page, relays: RelayFixture[] = [], path = '/', options: BootOptions = {}) {
  await page.addInitScript(({ savedRelays, standalone, navigatorStandalone, userAgent, largeSlashCatalog }) => {
    if (savedRelays.length) localStorage.setItem('lerdr_relays', JSON.stringify(savedRelays));
    if (navigatorStandalone !== null) {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: navigatorStandalone });
    }
    if (userAgent) {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent });
    }
    if (standalone) {
      const nativeMatchMedia = window.matchMedia.bind(window);
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value(query: string) {
          const result = nativeMatchMedia(query);
          if (query === '(display-mode: standalone)') {
            Object.defineProperty(result, 'matches', { configurable: true, value: true });
          }
          return result;
        },
      });
    }
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(handler, timeout === 3000 ? 30 : timeout, ...args)) as typeof window.setTimeout;

    const sockets: MockSocket[] = [];
    const commands: Record<string, unknown>[] = [];
    const socketCommands: Record<string, unknown>[][] = [];
    let nextInteraction: Record<string, unknown> | null = null;
    let conversationFixture: ConversationFixture | null = null;
    let autoCommands = true;
    const uploadFiles = new Map<string, Array<{ name: string; media_type: string; bytes: number }>>();
    const uploadReceived = new Map<string, number>();
    const installedVoices = new Set(['en']);
    const voiceNames: Record<string, string> = {
      en: 'en_US-lessac-medium', fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium',
      es: 'es_ES-davefx-medium', zh: 'zh_CN-huayan-medium',
    };
    const speechVoicePayload = () => ({
      cache_dir: '/home/test/.cache/herdr-mobile-relay/speech',
      engine_installed: true,
      languages: ['en', 'fr', 'de', 'es', 'zh'].filter((code) => installedVoices.has(code)),
      voices: ['en', 'fr', 'de', 'es', 'zh'].map((code) => ({
        language: code,
        name: voiceNames[code],
        installed: installedVoices.has(code),
        bytes: 63206179,
        engine: installedVoices.has(code) ? 'piper' : 'espeak-ng',
      })),
    });

    class MockSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = MockSocket.CONNECTING;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      readonly index: number;
      constructor(readonly url: string) {
        this.index = sockets.length;
        sockets.push(this);
        socketCommands.push([]);
        queueMicrotask(() => {
          this.readyState = MockSocket.OPEN;
          this.onopen?.();
        });
      }
      send(serialized: string) {
        const message = JSON.parse(serialized) as Record<string, unknown>;
        commands.push(message);
        socketCommands[this.index].push(message);
        if (['e2ee_client_hello', 'read_pane', 'watch_pane', 'unwatch_pane', 'pane_applied', 'get_activity', 'list_directories', 'refresh_agents'].includes(String(message.type))) return;
        if (!autoCommands) return;
        if (message.type === 'upload_begin') {
          const uploadId = `upload-${String(message.request_id)}`;
          uploadFiles.set(uploadId, message.files as Array<{ name: string; media_type: string; bytes: number }>);
          queueMicrotask(() => this.server({
            type: 'upload_begin_result',
            request_id: message.request_id,
            result: {
              upload_id: uploadId,
              chunk_bytes: 262144,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              limits: { max_files: 8, max_file_bytes: 20971520, max_batch_bytes: 52428800 },
            },
          }));
          return;
        }
        if (message.type === 'upload_chunk') {
          const key = `${String(message.upload_id)}:${String(message.file_index)}`;
          const received = (uploadReceived.get(key) || 0) + atob(String(message.data || '')).length;
          uploadReceived.set(key, received);
          queueMicrotask(() => this.server({
            type: 'upload_chunk_result',
            request_id: message.request_id,
            result: {
              file_index: message.file_index,
              next_sequence: Number(message.sequence) + 1,
              received_bytes: received,
            },
          }));
          return;
        }
        if (message.type === 'upload_finish') {
          const files = uploadFiles.get(String(message.upload_id)) || [];
          const digests = message.files as Array<{ file_index: number; sha256: string }>;
          queueMicrotask(() => this.server({
            type: 'upload_finish_result',
            request_id: message.request_id,
            result: {
              attachments: files.map((file, index) => ({
                ref: `attachment:test-${index + 1}`,
                name: file.name,
                media_type: file.media_type,
                bytes: file.bytes,
                sha256: digests[index]?.sha256 || '',
                expires_at: new Date(Date.now() + 60_000).toISOString(),
              })),
            },
          }));
          return;
        }
        if (message.type === 'upload_cancel') {
          queueMicrotask(() => this.server({
            type: 'upload_cancel_result',
            request_id: message.request_id,
            result: {},
          }));
          return;
        }
        if (message.type === 'list_slash_commands') {
          const commands = largeSlashCatalog
            ? Array.from({ length: 4096 }, (_, index) => ({
              command: `/catalog-${String(index).padStart(4, '0')}`,
              description: 'D'.repeat(240),
              argument_hint: 'H'.repeat(120),
              source: 'personal',
            }))
            : [
              { command: '/help', description: 'Show the full command reference and explain every available action', source: 'builtin' },
              { command: '/copy', description: 'Copy the latest agent response', source: 'builtin' },
              { command: '/model', description: 'Choose the active model', source: 'builtin' },
              { command: '/plan', description: 'Enter plan mode', argument_hint: '[prompt]', source: 'builtin' },
              ...Array.from({ length: 18 }, (_, index) => ({
                command: `/sample-${index + 1}`,
                description: `Example command ${index + 1}`,
                source: 'builtin',
              })),
            ];
          if (largeSlashCatalog) {
            commands[350] = {
              command: '/late-command',
              description: 'Late command',
              argument_hint: 'H'.repeat(120),
              source: 'personal',
            };
          }
          queueMicrotask(() => this.server({
            type: 'command_result', request_id: message.request_id, ok: true, phase: 'completed',
            data: { commands, truncated: false },
          }));
          return;
        }
        if (message.type === 'worktree_list') {
          queueMicrotask(() => this.server({
            type: 'command_result',
            action: message.type,
            request_id: message.request_id,
            ok: true,
            phase: 'completed',
            data: {
              source: {
                repo_key: 'repo',
                repo_name: 'project',
                repo_root: '/work/project',
                source_checkout_path: '/work/project',
                source_workspace_id: 'w1',
              },
              worktrees: [
                {
                  path: '/work/worktrees/project/fix-one',
                  branch: 'fix/one',
                  is_bare: false,
                  is_detached: false,
                  is_prunable: false,
                  is_linked_worktree: true,
                  label: 'fix/one',
                  open_workspace_id: null,
                },
              ],
            },
          }));
          return;
        }
        if (String(message.type).startsWith('workspace_')) {
          let data: Record<string, unknown>;
          switch (message.type) {
            case 'workspace_tree':
              data = {
                root: '/work/mobile',
                entries: [
                  { path: 'README.md', name: 'README.md', kind: 'file', size: 24 },
                  { path: 'src', name: 'src', kind: 'directory' },
                  { path: 'src/main.ts', name: 'main.ts', kind: 'file', size: 42 },
                ],
              };
              break;
            case 'workspace_file':
              data = {
                path: message.path,
                media_type: 'text/markdown',
                kind: 'text',
                text: '# Workspace preview\n\nRead-only file contents.',
                size: 46,
              };
              break;
            case 'workspace_git_status':
              data = {
                available: true,
                branch: 'feature/mobile',
                files: [{ path: 'README.md', status: ' M' }],
              };
              break;
            default:
              data = {
                path: message.path,
                diff: [
                  'diff --git a/README.md b/README.md',
                  '--- a/README.md',
                  '+++ b/README.md',
                  '@@ -1 +1 @@',
                  '-Old text',
                  '+Read-only change',
                ].join('\n'),
              };
          }
          queueMicrotask(() => this.server({
            type: 'command_result',
            action: message.type,
            request_id: message.request_id,
            ok: true,
            phase: 'completed',
            data,
          }));
          return;
        }
        if (message.type === 'get_conversation_history') {
          const cursor = typeof message.cursor === 'string' ? message.cursor : '';
          const older = Boolean(cursor);
          if (conversationFixture) {
            const fixture = conversationFixture;
            const configuredPage = cursor ? fixture.pages?.[cursor] : undefined;
            const pageEntries = configuredPage?.entries ?? (cursor ? [] : fixture.entries);
            const pageCursor = configuredPage?.nextCursor || (!cursor ? fixture.nextCursor : '') || '';
            const pageHasMore = configuredPage?.hasMore ?? (!cursor ? fixture.hasMore : undefined) ?? Boolean(pageCursor);
            queueMicrotask(() => this.server({
              type: 'command_result',
              action: message.type,
              request_id: message.request_id,
              ok: true,
              phase: 'completed',
              data: {
                available: true,
                state: configuredPage?.state || 'ready',
                mode: older ? 'snapshot' : 'recent',
                source_revision: configuredPage?.sourceRevision || fixture.sourceRevision || 'fixture',
                snapshot_id: configuredPage?.snapshotId || (older ? 'snapshot-1' : ''),
                next_cursor: pageCursor,
                entries: pageEntries,
                has_more: pageHasMore,
                total: fixture.total,
                diagnostics: configuredPage?.diagnostics || fixture.diagnostics || { source_truncated: false, corrupt_records: 0, oversized_records: 0 },
              },
            }));
            return;
          }
          queueMicrotask(() => this.server({
            type: 'command_result',
            action: message.type,
            request_id: message.request_id,
            ok: true,
            phase: 'completed',
            data: {
              available: true,
              state: 'ready',
              mode: older ? 'snapshot' : 'recent',
              source_revision: 'fixture',
              snapshot_id: older ? 'snapshot-1' : '',
              next_cursor: older ? '' : 'cursor-1',
              entries: older
                ? [{ id: 'turn-1', timestamp: '2026-08-12T09:00:00Z', role: 'user', text: 'first retained question' }]
                : [
                  {
                    id: 'turn-2',
                    timestamp: '2026-08-12T09:00:01Z',
                    role: 'assistant',
                    text: 'intermediate progress update',
                    tools: [{ id: 'tool-1', name: 'Read', input: 'README.md', output: 'file contents' }],
                  },
                  {
                    id: 'turn-2-final',
                    timestamp: '2026-08-12T09:00:02Z',
                    role: 'assistant',
                    text: '# middle retained answer',
                  },
                  { id: 'turn-3', timestamp: '2026-08-12T09:00:03Z', role: 'user', text: 'latest retained question' },
                ],
              has_more: !older,
              total: 4,
              diagnostics: { source_truncated: true, corrupt_records: 0, oversized_records: 0 },
            },
          }));
          return;
        }
        if (message.type === 'copy_agent_response') {
          queueMicrotask(() => this.server({
            type: 'command_result',
            action: message.type,
            request_id: message.request_id,
            ok: true,
            phase: 'completed',
            data: {
              text: '# Remote markdown response\n\n- Exact copied output',
              source: 'clipboard',
              chars: 49,
              lines: 3,
            },
          }));
          return;
        }
        if (message.type === 'speak_text') {
          const samples = 800;
          const wav = new Uint8Array(44 + samples * 2);
          const view = new DataView(wav.buffer);
          const ascii = (offset: number, value: string) => {
            for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i);
          };
          ascii(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVEfmt ');
          view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
          view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
          view.setUint16(32, 2, true); view.setUint16(34, 16, true);
          ascii(36, 'data'); view.setUint32(40, samples * 2, true);
          queueMicrotask(() => this.server({
            type: 'command_result',
            action: message.type,
            request_id: message.request_id,
            ok: true,
            phase: 'completed',
            data: { format: 'wav', audio: btoa(String.fromCharCode(...wav)) },
          }));
          return;
        }
        if (['speech_voices_list', 'speech_voice_install', 'speech_voice_remove'].includes(String(message.type))) {
          if (message.type === 'speech_voice_install') installedVoices.add(String(message.language));
          if (message.type === 'speech_voice_remove') installedVoices.delete(String(message.language));
          queueMicrotask(() => this.server({
            type: 'command_result', action: message.type, request_id: message.request_id,
            ok: true, phase: 'completed', data: speechVoicePayload(),
          }));
          return;
        }
        if (message.type === 'push_subscribe' || message.type === 'push_unsubscribe') return;
        const phase = message.type === 'answer_question' && nextInteraction
          ? 'advanced'
          : message.type === 'navigate_question' && nextInteraction ? 'navigated' : 'confirmed';
        let data: Record<string, unknown> = {};
        if ((message.type === 'answer_question' || message.type === 'navigate_question') && nextInteraction) data = { interaction: nextInteraction };
        else if (message.type === 'agent_start') data = { pane_id: 'w1:pre-placement' };
        else if (message.type === 'lease_pane_size') {
          data = typeof message.rows === 'number'
            ? { columns: message.columns, rows: message.rows }
            : { columns: message.columns };
        }
        else if (message.type === 'agent_clear') data = {
          pane_id: 'w1:pre-clear', name: 'clear-codex-123', cwd: '/home/test/Development/relay',
        };
        if (message.type === 'answer_question' || message.type === 'navigate_question') nextInteraction = null;
        queueMicrotask(() => this.server({
          type: 'command_result', action: message.type, request_id: message.request_id, ok: true, phase, data,
        }));
      }
      close() { this.readyState = MockSocket.CLOSED; }
      server(message: unknown) {
        const withExactIdentity = (agent: Record<string, unknown>) => ({
          server_session_id: 'primary',
          terminal_id: `terminal-${String(agent.pane_id)}`,
          generation: 1,
          agent_session_id: '',
          ...(agent.attention_kind === 'approval' && Array.isArray(agent.options) && agent.options.length >= 2
            ? { approval_fingerprint: `fingerprint-${String(agent.event_id || agent.pane_id)}` }
            : {}),
          ...agent,
        });
        let payload = message as Record<string, unknown>;
        if (payload?.type === 'agents' && Array.isArray(payload.agents)) {
          payload = { ...payload, agents: (payload.agents as Record<string, unknown>[]).map(withExactIdentity) };
        } else if ((payload?.type === 'blocked' || payload?.type === 'agent_update') && payload.pane_id) {
          payload = withExactIdentity(payload);
        }
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
      }
      serverClose() { this.readyState = MockSocket.CLOSED; this.onclose?.(); }
    }

    Object.defineProperty(window, 'WebSocket', { configurable: true, value: MockSocket });
    Object.assign(window, {
      __relayCommands: commands,
      __relaySockets: sockets,
      __relaySocketCommands(index: number) { return socketCommands[index] || []; },
      __relayServer(index: number, message: unknown) { sockets[index]?.server(message); },
      __relayClose(index: number) { sockets[index]?.serverClose(); },
      __relayNextInteraction(interaction: Record<string, unknown>) { nextInteraction = interaction; },
      __relayConversationFixture(fixture: ConversationFixture | null) {
        conversationFixture = fixture;
      },
      __relayAutoCommands(enabled: boolean) { autoCommands = enabled; },
    });
  }, {
    savedRelays: relays,
    standalone: options.standalone ?? false,
    navigatorStandalone: options.navigatorStandalone ?? null,
    userAgent: options.userAgent ?? '',
    largeSlashCatalog: options.largeSlashCatalog ?? false,
  });
  await page.goto(path);
}

export async function socketCount(page: Page) {
  try {
    return await page.evaluate(() => (window as any).__relaySockets.length as number);
  } catch (error) {
    // WebKit can tear down the old document between page.reload() and the
    // first poll against the new one. Let expect.poll observe the replacement
    // context instead of turning that expected navigation into a test failure.
    if (error instanceof Error && error.message.includes('Execution context was destroyed')) return 0;
    throw error;
  }
}

export async function server(page: Page, index: number, message: unknown) {
  await page.evaluate(({ socketIndex, payload }) => (window as any).__relayServer(socketIndex, payload), { socketIndex: index, payload: message });
}

export async function commands(page: Page) {
  return page.evaluate(() => (window as any).__relayCommands as Record<string, unknown>[]);
}

export async function updateProgressPlan(page: Page): Promise<Record<string, unknown> | null> {
  try {
    return await page.evaluate(() => JSON.parse(sessionStorage.getItem('lerdr_update_progress') || 'null'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('Execution context was destroyed')) return null;
    throw error;
  }
}

export async function commandsForSocket(page: Page, index: number) {
  return page.evaluate((socketIndex) => {
    const harnessWindow = window as unknown as {
      __relaySocketCommands(next: number): Record<string, unknown>[];
    };
    return harnessWindow.__relaySocketCommands(socketIndex);
  }, index);
}

export async function setAutoCommands(page: Page, enabled: boolean) {
  await page.evaluate((value) => {
    const harnessWindow = window as unknown as { __relayAutoCommands(next: boolean): void };
    harnessWindow.__relayAutoCommands(value);
  }, enabled);
}

export interface ConversationFixture {
  entries: Record<string, unknown>[];
  total: number;
  nextCursor?: string;
  hasMore?: boolean;
  diagnostics?: Record<string, unknown>;
  sourceRevision?: string;
  pages?: Record<string, {
    entries: Record<string, unknown>[];
    nextCursor?: string;
    hasMore?: boolean;
    state?: 'ready' | 'preparing' | 'failed';
    snapshotId?: string;
    sourceRevision?: string;
    diagnostics?: Record<string, unknown>;
  }>;
}

export async function setConversationFixture(page: Page, fixture: ConversationFixture | null) {
  await page.evaluate((value) => {
    const harnessWindow = window as unknown as {
      __relayConversationFixture(next: ConversationFixture | null): void;
    };
    harnessWindow.__relayConversationFixture(value);
  }, fixture);
}

export async function handshake(page: Page, index: number, overrides: Record<string, unknown> = {}) {
  await server(page, index, {
    type: 'push_config', protocol: 3, version: 'abc1234', host: index ? 'mac' : 'fedora',
    home: '/home/test',
    capabilities: ['attention_classification', 'clear_activities', 'directory_browser', 'self_update', 'structured_questions', 'slash_commands'],
    agent_profiles: [{ id: 'codex', label: 'Codex' }, { id: 'claude', label: 'Claude Code' }],
    ...overrides,
  });
}

export const fedora = { id: 'fedora', label: 'Fedora', url: 'wss://fedora.example', token: '' };
