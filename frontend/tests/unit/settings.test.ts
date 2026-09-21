import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from '$components/SettingsView.svelte';
import {
  APP_ASSET_VERSION,
  APP_VERSION,
  PUSH_ENABLED_KEY,
  TERMINAL_HISTORY_KEY,
  TERMINAL_REFRESH_KEY,
} from '$lib/config';
import { relayStore } from '$lib/store';
import { appUpdateStatus, MANAGED_UPDATE_COMMAND } from '$lib/updates';
import { defaultAgentView, paneAgentViewOverrides } from '$lib/preferences';

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(payload: string) { this.sent.push(payload); }
  close() { this.readyState = 3; }
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  server(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('settings relay status', () => {
  const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') });
    vi.stubGlobal('PushManager', class {});
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    relayStore.destroy();
    relayStore.relayConfigs.set([]);
    defaultAgentView.set('terminal');
    paneAgentViewOverrides.set({});
    appUpdateStatus.set({
      state: 'current',
      currentVersion: APP_VERSION,
      currentAssets: APP_ASSET_VERSION,
      deployedVersion: APP_VERSION,
      deployedAssets: APP_ASSET_VERSION,
      upstreamVersion: APP_VERSION,
      upstreamAssets: APP_ASSET_VERSION,
      checkedAt: 123,
      error: '',
    });
    relayStore.addRelay({ label: 'Fedora', url: 'wss://fedora.example', token: '' });
  });

  afterEach(() => {
    relayStore.destroy();
    relayStore.relayConfigs.set([]);
    defaultAgentView.set('terminal');
    paneAgentViewOverrides.set({});
    vi.unstubAllGlobals();
    if (serviceWorkerDescriptor) Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
    else Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('updates connection and push state without remounting settings', async () => {
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    expect(screen.getByRole('img', { name: 'Fedora relay connecting' })).toBeInTheDocument();
    expect(screen.getByText('Push: waiting for relay…')).toBeInTheDocument();

    socket.open();
    relayStore.setPushStatus('fedora-wss-fedora-example', 'sent');
    await waitFor(() => expect(screen.getByRole('img', { name: 'Fedora relay connected' })).toBeInTheDocument());
    expect(screen.getByText('Push: syncing…')).toBeInTheDocument();

    socket.server({ type: 'push_subscribed', ok: true });
    await waitFor(() => expect(screen.getByText('Push: synced')).toBeInTheDocument());
  });

  it('shows installed client and running server compatibility separately', async () => {
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      capabilities: ['workspace_management'],
      herdr_status: {
        installed_client_version: '0.9.0',
        server_version: '0.8.0',
        server_protocol: 7,
        server_protocol_known: true,
        endpoint_protocol_generation: 3,
        generation: 2,
        features: {
          'workspace.move_block': {
            state: 'unsupported',
            reason: 'method_not_supported',
            generation: 2,
          },
        },
      },
      agent_profiles: [],
    });
    expect(await screen.findByText('Herdr client: 0.9.0')).toBeInTheDocument();
    expect(screen.getByText(/Herdr server: 0\.8\.0/)).toBeInTheDocument();
    expect(screen.getByText(/protocol 7/)).toBeInTheDocument();
    expect(screen.getByText('Herdr 0.9.0 recommended.')).toBeInTheDocument();
    expect(screen.getByText('Workspace group reorder: Server upgrade needed')).toBeInTheDocument();
  });

  it('does not warn for unprobed or unadvertised optional Herdr features', async () => {
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      capabilities: [],
      herdr_status: {
        server_version: '0.9.0',
        server_protocol_known: false,
        generation: 1,
        features: {
          ordinary_json: { state: 'supported', reason: 'ping', generation: 1 },
          direct_terminal: { state: 'unknown', reason: 'not_checked', generation: 1 },
          'pane.read': { state: 'unknown', reason: 'not_checked', generation: 1 },
          'client_shell.endpoint': { state: 'unknown', reason: 'not_advertised', generation: 1 },
        },
      },
      agent_profiles: [],
    });
    expect(await screen.findByText(/Herdr server: 0\.9\.0/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not check|Server upgrade needed|Server feature unavailable/)).not.toBeInTheDocument();

    // A real read failure must appear without remounting Settings, and a later
    // successful observation must remove it rather than leave a stale warning.
    socket.server({
      type: 'herdr_status',
      status: {
        server_version: '0.9.0',
        server_protocol_known: false,
        generation: 2,
        features: {
          'pane.read': { state: 'unknown', reason: 'timeout', generation: 2 },
        },
      },
    });
    expect(await screen.findByText('Terminal reads: Could not check')).toBeInTheDocument();
    socket.server({
      type: 'herdr_status',
      status: {
        server_version: '0.9.0',
        server_protocol_known: false,
        generation: 3,
        features: {
          'pane.read': { state: 'supported', reason: 'operation_succeeded', generation: 3 },
        },
      },
    });
    await waitFor(() => expect(screen.queryByText('Terminal reads: Could not check')).not.toBeInTheDocument());
  });

  it.each([
    ['server_unavailable', 'Could not check'],
    ['malformed_ping', 'Could not check'],
    ['probe_failed', 'Could not check'],
    ['reconnect_required', 'Rechecking after Herdr reconnect'],
  ])(
    'keeps Herdr check outcomes visible: %s',
    async (reason, message) => {
      render(SettingsView);
      const socket = MockWebSocket.instances[0];
      socket.open();
      socket.server({
        type: 'push_config',
        protocol: 3,
        capabilities: [],
        herdr_status: {
          server_protocol_known: false,
          generation: 1,
          features: {
            ordinary_json: { state: 'unknown', reason, generation: 1 },
            direct_terminal: { state: 'unknown', reason: 'not_checked', generation: 1 },
          },
        },
        agent_profiles: [],
      });
      expect(await screen.findByText(`Herdr API: ${message}`)).toBeInTheDocument();
    },
  );

  it('names the relay URL carrying the connection', async () => {
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(await screen.findByText('Connection: relay URL fedora.example')).toBeInTheDocument();
  });

  it('shows the relay release version and an available update', async () => {
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      release_version: '0.15.0',
      version: 'abc1234',
      capabilities: ['self_update'],
      agent_profiles: [],
      update: { state: 'available', available_version: '0.16.0', upstream_version: '0.16.0', available_revision: 'a'.repeat(12) },
    });

    expect(await screen.findByText(/v0\.15\.0/)).toBeInTheDocument();
    expect(await screen.findByText('Update v0.16.0 available')).toBeInTheDocument();
  });

  it('shows the complete one-time update command for an older relay', async () => {
    const user = userEvent.setup();
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      release_version: '0.6.0',
      capabilities: [],
      agent_profiles: [],
    });

    await user.click(await screen.findByRole('button', { name: 'How to update Fedora' }));
    const dialog = screen.getByRole('dialog', { name: 'Update Fedora' });
    expect(dialog).toHaveTextContent('one-time Terminal update before phone-driven updates can continue');
    expect(within(dialog).getByText(/LERDR_NO_AUTO_SETUP=1 herdr plugin install/)).not.toHaveTextContent(
      'plugin action invoke install-service',
    );
    expect(dialog).toHaveTextContent('preserves the configuration used by an existing stable service');
    expect(dialog).toHaveTextContent('Prefer to keep using a source checkout?');
    expect(screen.queryByText(/assets \d+/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).at(-1)).toHaveTextContent('About');
  });
  it('routes a relay without self-update support to Update Help before scheduling', async () => {
    const user = userEvent.setup();
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      release_version: '0.13.2',
      capabilities: [],
      agent_profiles: [],
      update: {
        state: 'available',
        current_version: '0.13.2',
        available_version: APP_VERSION,
        available_revision: 'f'.repeat(12),
        target_revision: 'f'.repeat(40),
        can_install: true,
      },
    });

    expect(await screen.findByText('Manual update required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check Fedora for updates' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'How to update Fedora' }));
    const dialog = screen.getByRole('dialog', { name: 'Update Fedora' });
    expect(dialog).toHaveTextContent('one-time Terminal update before phone-driven updates can continue');
    expect(dialog).toHaveTextContent(MANAGED_UPDATE_COMMAND);
    expect(socket.sent.map((payload) => JSON.parse(payload)).some((message) => message.type === 'install_update')).toBe(false);
  });


  it('requires confirmation before removing a relay', async () => {
    const user = userEvent.setup();
    render(SettingsView);

    await user.click(screen.getByRole('button', { name: 'Remove Fedora' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Fedora?' });
    expect(dialog).toHaveTextContent('You will need its setup link or connection details to add it again.');
    expect(screen.getByText('Fedora')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Fedora')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Fedora' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Remove Fedora?' })).getByRole('button', { name: 'Remove Relay' }));
    await waitFor(() => expect(screen.queryByText('Fedora')).not.toBeInTheDocument());
  });

  it('shows and persists the global Default View choice', async () => {
    const user = userEvent.setup();
    const first = render(SettingsView);
    const views = within(screen.getByRole('group', { name: 'Default View' }));
    expect(views.getByRole('button', { name: 'Terminal' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(views.getByRole('button', { name: 'Conversation' }));
    expect(views.getByRole('button', { name: 'Conversation' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('lerdr_default_agent_view')).toBe('conversation');
    first.unmount();
    render(SettingsView);
    expect(within(screen.getByRole('group', { name: 'Default View' })).getByRole('button', { name: 'Conversation' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the previous global choice when local storage rejects a save', async () => {
    const user = userEvent.setup();
    render(SettingsView);
    const views = within(screen.getByRole('group', { name: 'Default View' }));
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage full');
    });
    await user.click(views.getByRole('button', { name: 'Conversation' }));
    expect(views.getByRole('button', { name: 'Terminal' })).toHaveAttribute('aria-pressed', 'true');
    expect(views.getByRole('button', { name: 'Conversation' })).toHaveAttribute('aria-pressed', 'false');
    setItem.mockRestore();
  });

  it('shows the local agent choice without a connected relay', () => {
    relayStore.destroy();
    relayStore.relayConfigs.set([]);
    render(SettingsView);
    expect(screen.getByRole('group', { name: 'Default View' })).toBeInTheDocument();
  });

  it('applies interface size from the accessible settings group', async () => {
    const user = userEvent.setup();
    render(SettingsView);
    const sizes = within(screen.getByRole('group', { name: 'Interface Size' }));

    await user.click(sizes.getByRole('button', { name: 'Large' }));
    expect(document.documentElement.dataset.interfaceSize).toBe('large');
    expect(localStorage.getItem('lerdr_terminal_font_size')).toBe('large');

    await user.click(sizes.getByRole('button', { name: 'Compact' }));
    expect(document.documentElement.dataset.interfaceSize).toBe('compact');

  });

  it('persists the selected terminal history size', async () => {
    const user = userEvent.setup();
    render(SettingsView);
    const history = within(screen.getByRole('group', { name: 'Terminal History' }));

    expect(history.getByRole('button', { name: '1000' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(history.getByRole('button', { name: '500' }));
    expect(history.getByRole('button', { name: '500' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(TERMINAL_HISTORY_KEY)).toBe('500');

    await user.click(history.getByRole('button', { name: '1000' }));
  });

  it('persists the selected terminal refresh interval', async () => {
    const user = userEvent.setup();
    render(SettingsView);
    const refresh = within(screen.getByRole('group', { name: 'Terminal Refresh' }));

    expect(refresh.getByRole('button', { name: '250 ms' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(refresh.getByRole('button', { name: '100 ms' }));
    expect(refresh.getByRole('button', { name: '100 ms' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(TERMINAL_REFRESH_KEY)).toBe('100');

    await user.click(refresh.getByRole('button', { name: '250 ms' }));
  });

  it('does not expose removed terminal width choices', () => {
    render(SettingsView);

    expect(screen.queryByRole('group', { name: 'Terminal Width' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fit to Phone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Original Columns' })).not.toBeInTheDocument();
    expect(screen.getByText(/Resize Session automatically leases/)).toBeInTheDocument();
  });

  it('keeps notification controls out of the way until push delivery is enabled', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PUSH_ENABLED_KEY, 'false');
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    await waitFor(() => expect(screen.getByRole('img', { name: 'Fedora relay connected' })).toBeInTheDocument());
    socket.server({ type: 'push_config', protocol: 3, version: 'abc1234', vapid_public_key: 'test-key' });

    // One Notifications section owns the switch; categories, delays, and
    // delivery tests do nothing without a subscription, so they stay hidden.
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByText('No paired notification device is available.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Push delivery' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Permission and installation' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Enable Push Notifications' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Push Notifications' })).toBeEnabled());
    expect(screen.getByText('No paired notification device is available.')).toBeInTheDocument();
  });

  it('confirms an available relay update before sending the exact target', async () => {
    const user = userEvent.setup();
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      release_version: '0.7.0',
      revision: 'abc123',
      capabilities: ['self_update'],
      agent_profiles: [],
      update: {
        state: 'available',
        current_version: '0.7.0',
        current_revision: 'abc123',
        available_version: '0.8.0',
        available_revision: 'f'.repeat(12),
        target_revision: 'f'.repeat(40),
        can_install: true,
        mode: 'local',
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Update Relays' }));
    expect(screen.getByRole('dialog', { name: 'Update Relays' })).toHaveTextContent('Update Fedora first');
    expect(screen.queryByRole('button', { name: 'Update Fedora to version 0.8.0' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start Update' }));
    const command = socket.sent.map((payload) => JSON.parse(payload))
      .find((message) => message.type === 'install_update');

    expect(command).toMatchObject({
      expected_version: '0.8.0',
      expected_revision: 'f'.repeat(40),
    });
    socket.server({
      type: 'command_result',
      request_id: command.request_id,
      ok: true,
      phase: 'scheduled',
      data: { update: { state: 'scheduled', target_revision: 'f'.repeat(40) } },
    });
  });

  it('explains that a relay-hosted app updates with the relay serving it', async () => {
    appUpdateStatus.set({
      state: 'deployment-required',
      currentVersion: APP_VERSION,
      currentAssets: APP_ASSET_VERSION,
      deployedVersion: APP_VERSION,
      deployedAssets: APP_ASSET_VERSION,
      upstreamVersion: '9.0.0',
      upstreamAssets: 999,
      checkedAt: 123,
      error: '',
    });
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      release_version: '9.0.0',
      revision: 'abc123',
      capabilities: ['self_update'],
      agent_profiles: [],
    });

    expect(await screen.findByText(/this app origin still serves/)).toBeInTheDocument();
    expect(screen.getByText(/Update the relay that hosts this origin/)).toBeInTheDocument();
    expect(socket.sent.map((payload) => JSON.parse(payload)).some((message) => message.type === 'deploy_app_update')).toBe(false);
  });
  it('updates the relay hosting this app origin', async () => {
    const user = userEvent.setup();
    appUpdateStatus.set({
      state: 'deployment-required',
      currentVersion: APP_VERSION,
      currentAssets: APP_ASSET_VERSION,
      deployedVersion: APP_VERSION,
      deployedAssets: APP_ASSET_VERSION,
      upstreamVersion: '9.0.0',
      upstreamAssets: 999,
      checkedAt: 123,
      error: '',
    });
    render(SettingsView);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.server({
      type: 'push_config',
      protocol: 3,
      release_version: '8.0.0',
      revision: 'abc123',
      capabilities: ['self_update'],
      agent_profiles: [],
      update: {
        state: 'available',
        current_version: '8.0.0',
        current_revision: 'abc123',
        available_version: '9.0.0',
        available_revision: 'f'.repeat(12),
        target_revision: 'f'.repeat(40),
        can_install: true,
        mode: 'plugin',
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Update Relays' }));
    const dialog = screen.getByRole('dialog', { name: 'Update Relays' });
    expect(dialog).toHaveTextContent('Update Fedora first');
    await user.click(within(dialog).getByRole('button', { name: 'Start Update' }));
    const commands = socket.sent.map((payload) => JSON.parse(payload));
    const command = commands.find((message) => message.type === 'install_update');

    expect(command).toMatchObject({
      expected_version: '9.0.0',
      expected_revision: 'f'.repeat(40),
    });
  });

});
