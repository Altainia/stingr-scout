<script lang="ts">
  import { normalizeMatchKey, type ScheduleMatch } from '@stingr/shared';
  import { onMount } from 'svelte';
  import type { Api } from '../lib/api';
  import ErrorNote from './ErrorNote.svelte';

  let { api }: { api: Api } = $props();

  type Row = { matchKey: string; teams: string[] };
  const COLS = ['Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'];
  let rows = $state<Row[]>([]);
  let tbaKeySet = $state(false);
  let csv = $state('');
  let csvErrors = $state<string[]>([]);
  let message = $state<string | null>(null);
  let error = $state<unknown>(null);
  let busy = $state(false);

  const toRows = (m: ScheduleMatch[]): Row[] =>
    m.map(x => ({ matchKey: x.matchKey, teams: [...x.red, ...x.blue].map(t => (t ? String(t) : '')) }));

  async function load() {
    const [sched, s] = await Promise.all([api.schedule(), api.settings()]);
    rows = toRows(sched);
    tbaKeySet = s.tbaKeySet;
  }

  onMount(() => { load().catch(e => { error = e; }); });

  async function act(fn: () => Promise<string>) {
    busy = true;
    error = null;
    message = null;
    csvErrors = [];
    try {
      message = await fn();
      await load();
    } catch (e) {
      error = e;
    } finally {
      busy = false;
    }
  }

  const fromTba = () => act(async () => {
    const r = await api.fetchTba();
    return r.scheduleReplaced
      ? `Downloaded ${r.matches} matches and ${r.teams} teams from The Blue Alliance.`
      : `The Blue Alliance has no matches for this event yet. The team list (${r.teams} teams) was updated and your schedule was kept.`;
  });

  const importCsv = () => act(async () => {
    const r = await api.importScheduleCsv(csv);
    if ('errors' in r) {
      csvErrors = r.errors;
      throw new Error('The schedule was not imported. Fix the lines below and try again.');
    }
    csv = '';
    return `Imported ${r.matches} match${r.matches === 1 ? '' : 'es'}.`;
  });

  const saveRows = () => act(async () => {
    const matches: ScheduleMatch[] = rows.map(r => {
      const t = r.teams.map(x => Number(x.trim().replace(/^frc/i, '')) || 0);
      return { matchKey: normalizeMatchKey(r.matchKey) ?? r.matchKey.trim(), red: [t[0], t[1], t[2]], blue: [t[3], t[4], t[5]] };
    });
    const saved = await api.saveSchedule(matches);
    return `Saved ${saved.length} matches.`;
  });

  async function readFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (file) csv = await file.text();
  }

  function addRow() {
    const last = rows.at(-1);
    const key = last ? normalizeMatchKey(last.matchKey) : null;
    const n = key?.startsWith('qm') ? Number(key.slice(2)) + 1 : rows.length + 1;
    rows = [...rows, { matchKey: `qm${n}`, teams: ['', '', '', '', '', ''] }];
  }
</script>

<section class="card">
  <h2>Schedule ({rows.length} matches)</h2>

  <h3>Download</h3>
  {#if tbaKeySet}
    <button type="button" class="primary" disabled={busy} onclick={fromTba}>Download from The Blue Alliance</button>
    <p class="hint">Needs this laptop to be online. Before the schedule is released, only the team list is updated.</p>
  {:else}
    <p class="hint">To download schedules, add a TBA API key in <a href="#/settings">Settings</a>.</p>
  {/if}

  <h3>Import a CSV file</h3>
  <p class="hint">Columns: match, red1, red2, red3, blue1, blue2, blue3 (a header row is optional). Match is a number for qualifications, or a key like sf2m1.</p>
  <div class="row">
    <input type="file" accept=".csv,text/csv" aria-label="CSV file" onchange={readFile} />
  </div>
  <textarea aria-label="Schedule CSV" rows="5" value={csv} placeholder="1,5098,254,1678,118,2056,148" oninput={e => (csv = e.currentTarget.value)}></textarea>
  <button type="button" disabled={busy || !csv.trim()} onclick={importCsv}>Import CSV</button>
  {#if csvErrors.length}
    <ul class="errors">{#each csvErrors as line, i (i)}<li>{line}</li>{/each}</ul>
  {/if}

  <h3>Edit by hand</h3>
  <table class="grid">
    <thead><tr><th>Match</th>{#each COLS as c (c)}<th class={c.startsWith('Red') ? 'red' : 'blue'}>{c}</th>{/each}<th></th></tr></thead>
    <tbody>
      {#each rows as r, i (i)}
        <tr>
          <td><input aria-label="Match {i + 1}" size="6" value={r.matchKey} oninput={e => (r.matchKey = e.currentTarget.value)} /></td>
          {#each r.teams as t, j (j)}
            <td><input aria-label="Match {i + 1} {COLS[j]}" size="5" inputmode="numeric" value={t} oninput={e => (r.teams[j] = e.currentTarget.value)} /></td>
          {/each}
          <td><button type="button" class="small" aria-label="Remove match {i + 1}" onclick={() => (rows = rows.filter((_, k) => k !== i))}>✕</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="row">
    <button type="button" onclick={addRow}>Add match</button>
    <button type="button" class="primary" disabled={busy} onclick={saveRows}>Save schedule</button>
  </div>

  {#if message}<p class="banner ok" role="status">{message}</p>{/if}
  <ErrorNote {error} />
</section>
