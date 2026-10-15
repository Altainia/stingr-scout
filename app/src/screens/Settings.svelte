<script lang="ts">
  import { SLOTS, type Slot } from '@stingr/shared';
  import { onMount } from 'svelte';
  import { slotLabel } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let name = $state(store.settings.deviceName);
  let slot = $state<Slot>(store.settings.defaultSlot);
  let saved = $state(false);
  let lastSync = $state<string | null>(null);

  onMount(async () => {
    lastSync = (await store.db.getKv('lastSyncAt')) ?? null;
  });

  async function save() {
    await store.saveSettings({ deviceName: name.trim() || store.settings.deviceName, defaultSlot: slot });
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
    <button type="button" class="primary" onclick={save}>Save</button>
    {#if saved}<span>Saved ✓</span>{/if}
  </div>
  <dl>
    <dt>Device ID</dt><dd>{store.settings.deviceId}</dd>
    <dt>App version</dt><dd>{__BUILD_ID__}</dd>
    <dt>Last sync</dt><dd>{lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</dd>
    <dt>Records on this tablet</dt><dd>{store.records.length} ({store.pendingCount} not synced)</dd>
  </dl>
</section>
