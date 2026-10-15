<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmDialog from '../../../../app/src/components/ConfirmDialog.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { Api, EventsView } from '../lib/api';

  let { api }: { api: Api } = $props();
  let view = $state<EventsView | null>(null);
  let file = $state<File | null>(null);
  let confirming = $state(false);
  let done = $state(false);
  let error = $state<unknown>(null);

  onMount(async () => {
    try {
      view = await api.events();
    } catch (e) {
      error = e;
    }
  });

  async function restore() {
    confirming = false;
    if (!file) return;
    error = null;
    try {
      await api.restore(file);
      done = true;
      view = await api.events();
    } catch (e) {
      error = e;
    }
  }
</script>

<h1>Export &amp; backup</h1>
<ErrorNote {error} />

<section class="card">
  <h2>Export to a spreadsheet</h2>
  {#if view?.current}
    <p>CSV files for {view.current.name}. They open in Google Sheets, Excel or Tableau.</p>
    <ul class="list">
      <li><a href="/api/export/matches.csv" download>Match data</a> <span class="muted">one row per robot per match</span></li>
      <li><a href="/api/export/pit.csv" download>Pit data</a> <span class="muted">one row per pit interview</span></li>
      <li><a href="/api/export/teams.csv" download>Team summaries</a> <span class="muted">one row per team</span></li>
    </ul>
  {:else if view}
    <p><a href="#/event">Choose an event first</a>.</p>
  {/if}
</section>

<section class="card">
  <h2>Back up</h2>
  <p>Saves everything on this hub (all events, forms, records and photos) in one file. Keep a copy on a USB drive during events.</p>
  <a class="button" href="/api/backup" download>Download backup</a>
</section>

<section class="card">
  <h2>Restore</h2>
  <p>Replaces everything on this hub with a backup file. The current data is first saved next to the hub's database.</p>
  <div class="row">
    <input type="file" accept=".db,application/octet-stream" aria-label="Backup file" onchange={e => { file = e.currentTarget.files?.[0] ?? null; done = false; }} />
    <button type="button" disabled={!file} onclick={() => (confirming = true)}>Restore…</button>
  </div>
  {#if done}<p class="banner ok" role="status">Restored. Other open hub pages show the restored data after a reload.</p>{/if}
</section>

{#if confirming && file}
  <ConfirmDialog
    title="Replace all hub data?"
    confirmLabel="Replace with the backup"
    cancelLabel="Cancel"
    onconfirm={restore}
    oncancel={() => (confirming = false)}
  >
    <p>Everything on this hub is replaced by “{file.name}”.</p>
  </ConfirmDialog>
{/if}
