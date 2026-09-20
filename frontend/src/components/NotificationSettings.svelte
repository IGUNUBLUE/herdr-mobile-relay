<script lang="ts">
  import SettingsRow from '$components/settings/SettingsRow.svelte';
  import SettingsSection from '$components/settings/SettingsSection.svelte';
  import AppSwitch from '$components/ui/AppSwitch.svelte';
  import Button from '$components/ui/Button.svelte';
  import {
    isNativeShell,
    nativeNotificationPermissionState,
    requestNativeNotificationPermission,
  } from '$lib/native';
  import {
    finishedNotificationsEnabled,
    nativeAttentionNotificationsEnabled,
    nativeRelayStatusNotificationsEnabled,
    setLocalFinishedNotifications,
    setNativeAttentionNotifications,
    setNativeRelayStatusNotifications,
  } from '$lib/push';
  import {
    clearSnooze,
    pushPolicyScopeKey,
    withGlobalSnooze,
    withTimedSnooze,
    type DevicePushPolicy,
    type NotificationPlatformInfo,
    type NotificationPolicyScope,
    type PushCategory,
    type PushPolicyChange,
    type PushTestRequest,
    type PushTestState,
  } from '$lib/push-policy';

  type ConfigurableCategory = Exclude<PushCategory, 'brief' | 'update'>;
  const CATEGORY_LABELS: Record<ConfigurableCategory, { label: string; detail: string }> = {
    attention: { label: 'Approval needed', detail: 'An agent needs your review.' },
    question: { label: 'Questions', detail: 'An agent needs your answer.' },
    finished: { label: 'Finished', detail: 'An agent finished.' },
    test: { label: 'Test notifications', detail: 'Delivery checks for this device.' },
  };
  const CONFIGURABLE_CATEGORIES: ConfigurableCategory[] = ['attention', 'question', 'finished', 'test'];

  let {
    scopes = [],
    platform,
    testState = { status: 'idle' },
    testStates = {},
    busy = false,
    deliveryEnabled = false,
    onpolicychange,
    ontoggle,
    ontest,
  }: {
    scopes?: NotificationPolicyScope[];
    platform: NotificationPlatformInfo;
    testState?: PushTestState;
    testStates?: Record<string, PushTestState>;
    busy?: boolean;
    // Categories, delays, and tests only mean something once this browser
    // subscribes, so they stay hidden until push delivery is on.
    deliveryEnabled?: boolean;
    onpolicychange?: (change: PushPolicyChange) => void | Promise<void>;
    ontoggle?: () => void | Promise<void>;
    ontest?: (request: PushTestRequest) => void | Promise<void>;
  } = $props();

  let selectedKey = $state('');
  let localPolicies = $state<Record<string, DevicePushPolicy>>({});
  let saving = $state(false);
  let policyError = $state('');

  const nativeShell = isNativeShell();
  let nativePermission = $state<'granted' | 'prompt' | 'denied' | null>(null);
  let nativeAttention = $state(nativeAttentionNotificationsEnabled());
  let nativeFinished = $state(finishedNotificationsEnabled());
  let nativeRelayStatus = $state(nativeRelayStatusNotificationsEnabled());

  $effect(() => {
    if (nativeShell) void nativeNotificationPermissionState().then(state => { nativePermission = state; });
  });

  async function allowNativeNotifications(): Promise<void> {
    const granted = await requestNativeNotificationPermission();
    nativePermission = granted ? 'granted' : 'denied';
  }

  function changeNativeAttention(checked: boolean): void {
    nativeAttention = checked;
    setNativeAttentionNotifications(checked);
  }

  function changeNativeFinished(checked: boolean): void {
    nativeFinished = checked;
    setLocalFinishedNotifications(checked);
  }

  function changeNativeRelayStatus(checked: boolean): void {
    nativeRelayStatus = checked;
    setNativeRelayStatusNotifications(checked);
  }

  const selectedScope = $derived.by(() => {
    const exact = scopes.find(scope => pushPolicyScopeKey(scope.relay_id, scope.device_id) === selectedKey);
    return exact || scopes[0] || null;
  });
  const effectiveSelectedKey = $derived(selectedScope
    ? pushPolicyScopeKey(selectedScope.relay_id, selectedScope.device_id)
    : '');
  const selectedPolicy = $derived(selectedScope
    ? localPolicies[effectiveSelectedKey] || selectedScope.policy
    : null);
  const selectedTestState = $derived(selectedScope
    ? testStates[selectedScope.relay_id] || testState
    : testState);
  const blocked = $derived(!platform.supports_push || platform.permission === 'denied');
  const deliveryHint = $derived.by(() => {
    if (!platform.supports_push) return 'This browser cannot receive push notifications.';
    if (platform.permission === 'denied') return 'Notifications are blocked for this site. Allow them below, then enable delivery again.';
    if (deliveryEnabled) return 'This browser keeps per-relay subscriptions synchronized.';
    return 'Enable delivery before testing or receiving background notifications.';
  });

  function chooseScope(event: Event): void {
    selectedKey = (event.currentTarget as HTMLSelectElement).value;
  }

  async function applyPolicy(policy: DevicePushPolicy): Promise<void> {
    if (!selectedScope || !selectedPolicy || saving) return;
    const key = effectiveSelectedKey;
    const previous = selectedPolicy;
    localPolicies = { ...localPolicies, [key]: policy };
    policyError = '';
    saving = true;
    try {
      await onpolicychange?.({
        relay_id: selectedScope.relay_id,
        device_id: selectedScope.device_id,
        policy,
      });
    } catch {
      localPolicies = { ...localPolicies, [key]: previous };
      policyError = 'The relay did not save this notification policy.';
    } finally {
      saving = false;
    }
  }

  function changeCategory(category: PushCategory, checked: boolean): void {
    if (!selectedPolicy) return;
    applyPolicy({
      ...selectedPolicy,
      categories: { ...selectedPolicy.categories, [category]: checked },
    });
  }

  function changeMilliseconds(field: 'settle_ms' | 'cooldown_ms', event: Event): void {
    if (!selectedPolicy) return;
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    applyPolicy({ ...selectedPolicy, [field]: value });
  }

  function changeSnooze(event: Event): void {
    if (!selectedPolicy) return;
    const duration = (event.currentTarget as HTMLSelectElement).value;
    if (duration === 'global') applyPolicy(withGlobalSnooze(selectedPolicy));
    else if (duration === 'off') applyPolicy(clearSnooze(selectedPolicy));
    else applyPolicy(withTimedSnooze(selectedPolicy, Number(duration)));
  }

  function snoozeSelection(policy: DevicePushPolicy): string {
    if (!policy.snoozed) return 'off';
    return policy.snooze_until ? 'timed' : 'global';
  }

  function sendTest(): void {
    if (!selectedScope?.current_device) return;
    void ontest?.({ relay_id: selectedScope.relay_id });
  }

  const testMessage = $derived.by(() => {
    if (selectedTestState.status === 'sending') return 'Asking the relay service to send a neutral test…';
    if (selectedTestState.status === 'accepted') {
      const verb = selectedTestState.result === 'queued' ? 'queued' : 'accepted';
      return `The relay service ${verb} the test. This does not confirm that the phone displayed it.`;
    }
    if (selectedTestState.status === 'rejected') return `The relay could not accept the test (${selectedTestState.code}).`;
    return 'A test reports relay service acceptance only; it cannot confirm handset display or human delivery.';
  });
</script>

{#snippet allowNotifications()}
  <Button disabled={nativePermission === null} onclick={() => void allowNativeNotifications()}>Allow notifications</Button>
{/snippet}

<SettingsSection title="Notifications">
  {#if nativeShell}
    <SettingsRow control={nativePermission !== 'granted' ? allowNotifications : undefined}>
      <p class="hint" role="status">
        {#if nativePermission === 'granted'}
          Android notifications are on for this app.
        {:else if nativePermission === 'denied'}
          Notifications are blocked for this app. Allow them from Android settings.
        {:else}
          Allow notifications to hear about agents while the app is closed.
        {/if}
      </p>
    </SettingsRow>
    <fieldset class="row-group" aria-label="Notification categories">
      <SettingsRow>
        <AppSwitch
          checked={nativeAttention}
          label="Agents needing you"
          descriptionId="native-attention-hint"
          onchange={changeNativeAttention}
        />
        <p id="native-attention-hint" class="hint">An agent needs approval, an answer, or inspection.</p>
      </SettingsRow>
      <SettingsRow>
        <AppSwitch
          checked={nativeFinished}
          label="Finished"
          descriptionId="native-finished-hint"
          onchange={changeNativeFinished}
        />
        <p id="native-finished-hint" class="hint">An agent completed its task.</p>
      </SettingsRow>
      <SettingsRow>
        <AppSwitch
          checked={nativeRelayStatus}
          label="Relay status"
          descriptionId="native-relay-status-hint"
          onchange={changeNativeRelayStatus}
        />
        <p id="native-relay-status-hint" class="hint">A computer disconnected or reconnected.</p>
      </SettingsRow>
    </fieldset>
  {:else}
    <SettingsRow>
      {#snippet control()}
        <Button
          disabled={busy || !platform.supports_push}
          onclick={() => void ontoggle?.()}
        >{deliveryEnabled ? 'Stop Push Notifications' : 'Enable Push Notifications'}</Button>
      {/snippet}
      <p class="hint" role="status">{deliveryHint}</p>
    </SettingsRow>

    {#if deliveryEnabled}
      {#if scopes.length > 0 && selectedScope && selectedPolicy}
        <div class="pad">
          <label class="field-label scope-label" for="notification-scope">Relay and device</label>
          <select id="notification-scope" value={effectiveSelectedKey} onchange={chooseScope} disabled={busy || saving}>
            {#each scopes as scope (pushPolicyScopeKey(scope.relay_id, scope.device_id))}
              <option value={pushPolicyScopeKey(scope.relay_id, scope.device_id)}>
                {scope.relay_label} — {scope.device_label}{scope.current_device ? ' (this device)' : ''}
              </option>
            {/each}
          </select>
        </div>

        <fieldset class="row-group" aria-label="Notification categories" disabled={busy || saving}>
          {#each CONFIGURABLE_CATEGORIES as category (category)}
            <SettingsRow>
              <AppSwitch
                checked={selectedPolicy.categories[category]}
                label={CATEGORY_LABELS[category].label}
                descriptionId={`push-category-${category}`}
                onchange={checked => changeCategory(category, checked)}
              />
              <p id={`push-category-${category}`} class="hint">{CATEGORY_LABELS[category].detail}</p>
            </SettingsRow>
          {/each}
        </fieldset>

        <div class="pad">
          <div class="grid">
            <label>
              Settle delay
              <select value={String(selectedPolicy.settle_ms)} onchange={event => changeMilliseconds('settle_ms', event)} disabled={busy || saving}>
                <option value="0">Immediately</option>
                <option value="2000">2 seconds</option>
                <option value="5000">5 seconds</option>
                <option value="15000">15 seconds</option>
              </select>
            </label>
            <label>
              Cooldown
              <select value={String(selectedPolicy.cooldown_ms)} onchange={event => changeMilliseconds('cooldown_ms', event)} disabled={busy || saving}>
                <option value="0">None</option>
                <option value="30000">30 seconds</option>
                <option value="60000">1 minute</option>
                <option value="300000">5 minutes</option>
              </select>
            </label>
            <label>
              Snooze
              <select value={snoozeSelection(selectedPolicy)} onchange={changeSnooze} disabled={busy || saving}>
                <option value="off">Not snoozed</option>
                {#if selectedPolicy.snoozed && selectedPolicy.snooze_until}<option value="timed">Until {new Date(selectedPolicy.snooze_until).toLocaleString()}</option>{/if}
                <option value="3600000">For 1 hour</option>
                <option value="28800000">For 8 hours</option>
                <option value="86400000">For 24 hours</option>
                <option value="global">Until I turn it back on</option>
              </select>
            </label>
          </div>

          {#if policyError}<p class="hint error" role="alert">{policyError}</p>{/if}

          <div class="test-row">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || saving || selectedTestState.status === 'sending' || !selectedScope.current_device}
              onclick={sendTest}
            >Send neutral test</Button>
            {#if !selectedScope.current_device}
              <p class="hint">Test notifications from that device.</p>
            {/if}
          </div>
          <p class="hint" aria-live="polite">{testMessage}</p>
        </div>
      {:else}
        <div class="pad">
          <p class="hint">No paired notification device is available.</p>
        </div>
      {/if}
    {/if}

    {#if platform.platform === 'ios' && !platform.installed}
      <section class="guidance" aria-labelledby="ios-install-title">
        <h4 id="ios-install-title">Install on iPhone or iPad first</h4>
        <ol>
          <li>Open this site in Safari on iOS or iPadOS 16.4+.</li>
          <li>Tap Share, Add to Home Screen, then Add.</li>
          <li>Open Lerdr from the Home Screen and return here.</li>
        </ol>
        <p class="hint">iOS allows Web Push only from an installed Home Screen app after a tap.</p>
      </section>
    {/if}

    {#if blocked}
      <section class="guidance" aria-labelledby="manual-settings-title">
        <h4 id="manual-settings-title">Allow notifications for this app</h4>
        {#if platform.platform === 'ios'}
          <p class="hint"><strong>iPhone or iPad:</strong> In Settings, open Notifications, choose Lerdr, and enable Allow Notifications.</p>
        {:else if platform.platform === 'android'}
          <p class="hint"><strong>Android:</strong> Long-press Lerdr, open App info, then Notifications. For a browser tab, use its site settings.</p>
        {:else}
          <p class="hint">Use your browser's site permissions and your system's notification settings.</p>
        {/if}
      </section>
    {/if}
  {/if}
</SettingsSection>

<style>
  h4 { font-size: .82rem; margin: 0 0 .35rem; }
  .pad { border-top: 1px solid var(--border); padding: .85rem .9rem; }
  .pad > :first-child { margin-top: 0; }
  .pad > :last-child { margin-bottom: 0; }
  .scope-label { display: block; margin: 0 0 .3rem; }
  .row-group { border: 0; border-top: 1px solid var(--border); margin: 0; min-width: 0; padding: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .7rem; margin-top: 0; }
  .grid label { display: block; font-size: .78rem; font-weight: 650; }
  .grid select { margin-top: .3rem; }
  .test-row { display: flex; align-items: center; gap: .7rem; margin-top: .9rem; }
  .test-row .hint { margin: 0; }
  .guidance { border-top: 1px solid var(--border); padding: .85rem .9rem; }
  .guidance ol { font-size: .8rem; line-height: 1.5; margin: .35rem 0 .5rem; padding-left: 1.35rem; }
</style>
