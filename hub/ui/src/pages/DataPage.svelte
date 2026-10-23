<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmDialog from '../../../../app/src/components/ConfirmDialog.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { Api, EventCounts, EventsView, SeasonCounts } from '../lib/api';

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

  // Clearing: the dialog shows what will go and needs the event key (or NEW SEASON) typed before it works.
  let toDelete = $state('');
  let eventPreview = $state<EventCounts | null>(null);
  // "a, b and c"; alliance data is only mentioned when there is some.
  const listed = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join(''));
  const counted = (n: number, what: string) => (n ? [`${n} ${what}${n === 1 ? '' : 's'}`] : []);
  let seasonPreview = $state<SeasonCounts | null>(null);
  let typed = $state('');
  let cleared = $state<string | null>(null);
  let deleting = $derived(view?.events.find(e => e.key === toDelete) ?? null);
  const backupNote = (b: string | null) => (b ? ` A backup was saved first: backups/${b}` : '');

  async function askDeleteEvent() {
    error = null;
    typed = '';
    try {
      eventPreview = await api.eventClearPreview(toDelete);
    } catch (e) {
      error = e;
    }
  }

  async function confirmDeleteEvent() {
    const key = toDelete;
    eventPreview = null;
    try {
      const res = await api.deleteEvent(key, typed);
      cleared = `Deleted ${key}.${backupNote(res.backup)}`;
      toDelete = '';
      view = await api.events();
    } catch (e) {
      error = e;
    }
  }

  async function askNewSeason() {
    error = null;
    typed = '';
    try {
      seasonPreview = await api.seasonClearPreview();
    } catch (e) {
      error = e;
    }
  }

  async function confirmNewSeason() {
    seasonPreview = null;
    try {
      const res = await api.newSeason(typed);
      cleared = `New season started.${backupNote(res.backup)}`;
      view = await api.events();
    } catch (e) {
      error = e;
    }
  }

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
      <li><a href="/api/export/alliance.csv" download>Alliance results</a> <span class="muted">one row per alliance per match</span></li>
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

<section class="card">
  <h2>Clear data</h2>
  <p>For a new event or a new season, or to clear out tests and demos. A backup is saved in the hub's data folder first, so Restore can bring everything back.</p>
  <div class="row">
    <label>Event to delete
      <select aria-label="Event to delete" value={toDelete} onchange={e => (toDelete = e.currentTarget.value)}>
        <option value="">Choose…</option>
        {#each view?.events ?? [] as ev (ev.key)}<option value={ev.key}>{ev.name} ({ev.key})</option>{/each}
      </select>
    </label>
    <button type="button" class="danger" disabled={!toDelete} onclick={askDeleteEvent}>Delete event…</button>
  </div>
  <p class="muted">Removes the event's schedule, teams, records, photos and alliance results. Forms are kept.</p>
  <button type="button" class="danger" onclick={askNewSeason}>Start a new season…</button>
  <p class="muted">Removes every event, record, photo and form, the alliance results and fields, and the list of tablets. Tablets drop their synced copies on their next sync.</p>
  {#if cleared}<p class="banner ok" role="status">{cleared}</p>{/if}
</section>

{#if eventPreview && deleting}
  <ConfirmDialog
    title="Delete {deleting.name} ({deleting.key})?"
    confirmLabel="Delete event"
    cancelLabel="Keep it"
    confirmDisabled={typed !== deleting.key}
    onconfirm={confirmDeleteEvent}
    oncancel={() => (eventPreview = null)}
  >
    <p>This will remove {listed([`${eventPreview.matches} matches`, `${eventPreview.teams} teams`, `${eventPreview.records} records`, `${eventPreview.photos} photos`, ...counted(eventPreview.allianceResults, 'alliance result')])}.</p>
    <label>Type {deleting.key} to confirm <input aria-label="Type {deleting.key} to confirm" autocomplete="off" value={typed} oninput={e => (typed = e.currentTarget.value)} /></label>
  </ConfirmDialog>
{/if}

{#if seasonPreview}
  <ConfirmDialog
    title="Start a new season?"
    confirmLabel="Start new season"
    cancelLabel="Cancel"
    confirmDisabled={typed !== 'NEW SEASON'}
    onconfirm={confirmNewSeason}
    oncancel={() => (seasonPreview = null)}
  >
    <p>This will remove {listed([`${seasonPreview.events} events`, `${seasonPreview.records} records`, `${seasonPreview.photos} photos`, `${seasonPreview.forms} published forms`, `${seasonPreview.drafts} drafts`,
      ...counted(seasonPreview.allianceResults, 'alliance result'), ...counted(seasonPreview.allianceFields, 'alliance field'), `the list of ${seasonPreview.devices} tablets`])}. Hub settings are kept.</p>
    <label>Type NEW SEASON to confirm <input aria-label="Type NEW SEASON to confirm" autocomplete="off" value={typed} oninput={e => (typed = e.currentTarget.value)} /></label>
  </ConfirmDialog>
{/if}

{#if confirming && file}
  <ConfirmDialog
    title="Replace all hub data?"
    confirmLabel="Replace with the backup"
    cancelLabel="Cancel"
    onconfirm={restore}
    oncancel={() => (confirming = false)}
  >
    <p>Everything on this hub will be replaced by “{file.name}”.</p>
  </ConfirmDialog>
{/if}
