<script lang="ts">
  import { applyTheme, loadTheme, THEMES, type ThemeId } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { Api } from '../lib/api';

  let { api }: { api: Api } = $props();
  let keySet = $state<boolean | null>(null);
  let key = $state('');
  let error = $state<unknown>(null);
  let theme = $state<ThemeId>(loadTheme());

  onMount(async () => {
    try {
      keySet = (await api.settings()).tbaKeySet;
    } catch (e) {
      error = e;
    }
  });

  async function save(tbaKey: string) {
    error = null;
    try {
      keySet = (await api.saveSettings({ tbaKey })).tbaKeySet;
      key = '';
    } catch (e) {
      error = e;
    }
  }
</script>

<h1>Settings</h1>
<section class="card">
  <h2>Appearance</h2>
  <p class="hint">Each computer and tablet remembers its own theme.</p>
  <div class="row">
    <label>Theme
      <select aria-label="Theme" value={theme} onchange={e => { theme = e.currentTarget.value as ThemeId; applyTheme(theme); }}>
        {#each THEMES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
      </select>
    </label>
  </div>
</section>
<section class="card">
  <h2>The Blue Alliance</h2>
  <p>A TBA read API key lets the hub download an event's schedule and team list while this laptop is online. You can create one in your account on thebluealliance.com.</p>
  <p>{keySet === null ? '…' : keySet ? 'A key is saved.' : 'No key saved yet.'}</p>
  <div class="row">
    <label>TBA API key
      <input aria-label="TBA API key" type="password" autocomplete="off" value={key} oninput={e => (key = e.currentTarget.value)} />
    </label>
    <button type="button" class="primary" disabled={!key.trim()} onclick={() => save(key.trim())}>Save key</button>
    {#if keySet}<button type="button" onclick={() => save('')}>Remove key</button>{/if}
  </div>
  <ErrorNote {error} />
</section>
