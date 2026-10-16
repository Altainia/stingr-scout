<script lang="ts">
  import { applyTheme, loadTheme, SLOTS, type Slot, THEMES, type ThemeId } from '@stingr/shared';
  import { onMount } from 'svelte';
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
  <div class="row">
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
    <button type="button" class="primary" onclick={save}>Save</button>
    <label>Theme
      <select aria-label="Theme" value={theme} onchange={e => { theme = e.currentTarget.value as ThemeId; applyTheme(theme); }}>
        {#each THEMES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
      </select>
    </label>
    {#if saved}<span>Saved ✓</span>{/if}
  </div>
  <dl>
    <dt>Device ID</dt><dd>{store.settings.deviceId}</dd>
    <dt>App version</dt><dd>{__BUILD_ID__}</dd>
    <dt>Last sync</dt><dd>{lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</dd>
    <dt>Records on this tablet</dt><dd>{store.records.length} ({store.pendingCount} not synced)</dd>
  </dl>
</section>
