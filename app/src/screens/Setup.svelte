<script lang="ts">
  import { SLOTS, type Slot } from '@stingr/shared';
  import { slotLabel } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let name = $state(store.settings.deviceName);
  let slot = $state<Slot>(store.settings.defaultSlot);

  async function save() {
    if (!name.trim()) return;
    await store.saveSettings({ deviceName: name.trim(), defaultSlot: slot });
    store.go({ name: 'home' });
  }
</script>

<section>
  <h1>Set up this tablet</h1>
  <p>Give this tablet a name the hub will show (for example "Tablet 3") and the robot position it usually scouts.</p>
  <div class="row">
    <label>Tablet name <input aria-label="Tablet name" value={name} oninput={e => (name = e.currentTarget.value)} /></label>
    <label>Default slot
      <select aria-label="Default slot" value={slot} onchange={e => (slot = e.currentTarget.value as Slot)}>
        {#each SLOTS as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}
      </select>
    </label>
  </div>
  <button type="button" class="primary big" disabled={!name.trim()} onclick={save}>Save</button>
</section>
