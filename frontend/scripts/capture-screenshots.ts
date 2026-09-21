/**
 * Captures the screenshots shipped in ../images for the README.
 * Serves the committed web bundle (or HERDR_WEB_ROOT) and drives the
 * in-page mock relay from tests/browser/mock-relay.ts, so images always
 * match the real UI.
 *
 *   bun scripts/capture-screenshots.ts
 */
import { chromium, devices, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, fedora, handshake, server } from '../tests/browser/mock-relay';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(frontendDir, process.env.HERDR_WEB_ROOT ?? '../web');
const outDir = resolve(frontendDir, process.env.SCREENSHOT_DIR ?? '../images');
const port = Number(process.env.SCREENSHOT_PORT ?? '4179');
const baseURL = `http://127.0.0.1:${port}`;

const agents = [
  { pane_id: 'w1:p1', workspace_id: 'w1', status: 'done', project: 'alpha', agent: 'codex' },
  { pane_id: 'w1:p2', workspace_id: 'w1', status: 'idle', project: 'alpha', agent: 'claude' },
  { pane_id: 'w2:p1', workspace_id: 'w2', status: 'working', project: 'beta', agent: 'codex' },
  { pane_id: 'w2:p2', workspace_id: 'w2', status: 'idle', project: 'beta', agent: 'claude' },
  { pane_id: 'w4:p1', workspace_id: 'w4', status: 'idle', project: 'delta', agent: 'codex' },
  {
    pane_id: 'w3:p1', workspace_id: 'w3', status: 'blocked', attention_kind: 'approval',
    project: 'gamma', agent: 'codex', prompt: 'Approve the plan?', options: ['Yes', 'No'],
  },
];

const terminalContent = [
  'Plan ready for review — 4 steps',
  '',
  '  1. Harden relay reconnect backoff',
  '  2. Batch pane_delta frames on slow links',
  '  3. Ship the workspace layout picker',
  '  4. Cut v0.27.0 once smoke tests pass',
  '',
  'Other (type your own)',
  'Enter select · n note · ↑/↓ move · Tab/←/→ · Esc cancel',
].join('\n');

const waitForServer = async (): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(baseURL).catch(() => null);
    if (response?.ok) return;
    await Bun.sleep(100);
  }
  throw new Error(`browser-server did not come up on ${baseURL}`);
};

const waitForSocket = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const sockets = (window as { __relaySockets?: unknown[] }).__relaySockets;
    return Array.isArray(sockets) && sockets.length === 1;
  });
};

const startServer = (): ChildProcess =>
  spawn('node', [resolve(frontendDir, 'scripts/browser-server.mjs'), webRoot], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

const capture = async (page: Page, name: string): Promise<void> => {
  const path = resolve(outDir, name);
  await page.screenshot({ path, type: 'jpeg', quality: 82 });
  console.log(`wrote ${path}`);
};

const run = async (): Promise<void> => {
  await mkdir(outDir, { recursive: true });
  const serverProcess = startServer();
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const context = await browser.newContext({ ...devices['Pixel 7'], baseURL });
    const page = await context.newPage();

    await boot(page, [fedora]);
    await waitForSocket(page);
    await handshake(page, 0, { capabilities: ['attention_classification', 'pane_size_lease'] });
    await server(page, 0, { type: 'agents', agents });

    // Home: attention queue pinned on top, then the workspace cards.
    await page.getByRole('region', { name: 'Workspaces' }).waitFor();
    await page.locator('section.agent-section').first().waitFor();
    await capture(page, 'home.jpeg');

    // Terminal: open the blocked agent and show its approval prompt.
    await page.getByRole('button', { name: 'Open gamma on Fedora' }).click();
    await page.getByRole('log').waitFor();
    await server(page, 0, {
      type: 'pane_content', pane_id: 'w3:p1', format: 'plain', content: terminalContent,
    });
    await page.waitForFunction((needle) =>
      document.querySelector('[role="log"]')?.textContent?.includes(needle), 'Plan ready for review');
    await capture(page, 'terminal.jpeg');

    // Settings: relays, layout picker, notifications.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByRole('button', { name: 'By State' }).waitFor();
    await capture(page, 'settings.jpeg');
  } finally {
    await browser?.close();
    serverProcess.kill();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
