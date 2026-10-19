<script lang="ts">
  import { applyTheme, loadTheme, SLOTS, type Slot, THEMES, type ThemeId } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { slotLabel } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let name = $state(store.settings.deviceName);
  let slot = $state<Slot>(store.settings.defaultSlot);
  let redSide = $state<'event' | 'left' | 'right'>(store.settings.redSideOverride ?? 'event');
  let theme = $state<ThemeId>(loadTheme());
  let saved = $state(false);
  let lastSync = $state<string | null>(null);

  onMount(async () => {
    lastSync = (await store.db.getKv('lastSyncAt')) ?? null;
  });

  // Reset: one confirmation, and a second one when unsynced records would be lost.
  let resetStep = $state<'confirm' | 'lose' | null>(null);
  let unsynced = $derived(store.pendingCount);
  const records = (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`;

  async function reset() {
    resetStep = null;
    await store.resetTablet();
  }

  async function save() {
    await store.saveSettings({ deviceName: name.trim() || store.settings.deviceName, defaultSlot: slot, redSideOverride: redSide });
    saved = true;
  }
</script>

<section>
  <header class="bar">
    <h1>Settings</h1>
    <button type="button" onclick={() => store.go({ name: 'home' })}>Back</button>
  </header>
  <div class="stack">
    <label>Tablet name <input aria-label="Tablet name" value={name} oninput={e => { name = e.currentTarget.value; saved = false; }} /></label>
    <label>Default slot
      <select aria-label="Default slot" value={slot} onchange={e => { slot = e.currentTarget.value as Slot; saved = false; }}>
        {#each SLOTS as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}
      </select>
    </label>
    <label>Red alliance, seen from the stands
      <select aria-label="Red alliance side" value={redSide} onchange={e => { redSide = e.currentTarget.value as 'event' | 'left' | 'right'; saved = false; }}>
        <option value="event">Use the event's setting ({store.event?.redSide === 'right' ? 'right' : 'left'})</option>
        <option value="left">On our left</option>
        <option value="right">On our right</option>
      </select>
    </label>
    <div class="save-row">
      <button type="button" class="primary" onclick={save}>Save</button>
      {#if saved}<span>Saved ✓</span>{/if}
    </div>
  </div>

  <h2 class="sub">Appearance</h2>
  <div class="stack">
    <label>Theme
      <select aria-label="Theme" value={theme} onchange={e => { theme = e.currentTarget.value as ThemeId; applyTheme(theme); }}>
        {#each THEMES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
      </select>
    </label>
    <p class="hint">Theme changes right away.</p>
  </div>

  <h2 class="sub">This tablet</h2>
  <div class="stack">
    <button type="button" class="danger" onclick={() => (resetStep = 'confirm')}>Reset this tablet…</button>
    <p class="hint">Removes records, photos and the loaded event and forms, for demos and testing. Keeps this tablet's name and slot.</p>
  </div>

  <h2 class="sub">About this tablet</h2>
  <dl class="facts">
    <dt>Device ID</dt><dd>{store.settings.deviceId}</dd>
    <dt>App version</dt><dd>{__BUILD_ID__}</dd>
    <dt>Last sync</dt><dd>{lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</dd>
    <dt>Records on this tablet</dt><dd>{store.records.length} ({store.pendingCount} not synced)</dd>
  </dl>
</section>

{#if resetStep === 'confirm'}
  <ConfirmDialog title="Reset this tablet?" confirmLabel="Reset" cancelLabel="Cancel"
    onconfirm={() => (unsynced > 0 ? (resetStep = 'lose') : reset())} oncancel={() => (resetStep = null)}>
    <p>This will remove {records(store.records.length)}, their photos and the loaded event and forms. The tablet's name and slot are kept, and the next sync will load the hub's event and forms again.</p>
    {#if unsynced > 0}<p class="banner warn">{records(unsynced)} {unsynced === 1 ? 'has' : 'have'} not been synced and will be lost.</p>{/if}
    {#if store.draft}<p>The unfinished form will also be lost.</p>{/if}
  </ConfirmDialog>
{/if}

{#if resetStep === 'lose'}
  <ConfirmDialog title="Lose {unsynced} unsynced {unsynced === 1 ? 'record' : 'records'}?" confirmLabel="Yes, reset and lose {unsynced === 1 ? 'it' : 'them'}"
    cancelLabel="Keep them" onconfirm={reset} oncancel={() => (resetStep = null)}>
    <p>{unsynced === 1 ? 'It is' : 'They are'} only on this tablet. Plug it into the hub first to keep {unsynced === 1 ? 'it' : 'them'}.</p>
  </ConfirmDialog>
{/if}
