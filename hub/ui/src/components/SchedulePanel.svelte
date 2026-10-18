<script lang="ts">
  import { normalizeMatchKey, type ScheduleMatch } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ConfirmDialog from '../../../../app/src/components/ConfirmDialog.svelte';
  import type { Api } from '../lib/api';
  import ErrorNote from './ErrorNote.svelte';

  /** onchanged: the schedule changed, so the event's team list may have too. */
  let { api, onchanged = () => {} }: { api: Api; onchanged?: () => void } = $props();

  type Row = { matchKey: string; teams: string[] };
  const COLS = ['Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'];
  let rows = $state<Row[]>([]);
  let tbaKeySet = $state(false);
  let csv = $state('');
  let csvErrors = $state<string[]>([]);
  let message = $state<string | null>(null);
  let error = $state<unknown>(null);
  let busy = $state(false);
  let dirty = $state(false); // hand edits in the table that aren't saved yet
  let pendingReplace = $state<(() => Promise<void>) | null>(null);

  const toRows = (m: ScheduleMatch[]): Row[] =>
    m.map(x => ({ matchKey: x.matchKey, teams: [...x.red, ...x.blue].map(t => (t ? String(t) : '')) }));

  async function load() {
    const [sched, s] = await Promise.all([api.schedule(), api.settings()]);
    rows = toRows(sched);
    dirty = false;
    tbaKeySet = s.tbaKeySet;
  }

  onMount(() => {
    load().catch(e => { error = e; });
    const onLeave = (e: Event) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  });

  /** An import or download replaces the table; ask first if it has unsaved edits. */
  function replacing(run: () => Promise<void>) {
    if (dirty) pendingReplace = run;
    else void run();
  }

  async function act(fn: () => Promise<string>) {
    busy = true;
    error = null;
    message = null;
    csvErrors = [];
    try {
      message = await fn();
      await load();
      onchanged();
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
    // A blank cell is an empty slot; anything else must be a team number, so typos aren't silently dropped.
    const bad = rows.flatMap((r, i) => r.teams.flatMap((x, j) => {
      const t = x.trim().replace(/^frc/i, '');
      return t === '' || /^\d{1,5}$/.test(t) ? [] : [`Match ${i + 1}, ${COLS[j]}: "${x.trim()}" is not a team number`];
    }));
    if (bad.length) throw new Error(`The schedule was not saved. ${bad.join('. ')}.`);
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
    dirty = true;
  }
</script>

<section class="card">
  <h2>Schedule ({rows.length} matches)</h2>

  <h3>Download</h3>
  {#if tbaKeySet}
    <button type="button" class="primary" disabled={busy} onclick={() => replacing(fromTba)}>Download from The Blue Alliance</button>
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
  <button type="button" disabled={busy || !csv.trim()} onclick={() => replacing(importCsv)}>Import CSV</button>
  {#if csvErrors.length}
    <ul class="errors">{#each csvErrors as line, i (i)}<li>{line}</li>{/each}</ul>
  {/if}

  <h3>Edit by hand</h3>
  <div class="scroll-x">
    <table class="grid">
      <thead><tr><th>Match</th>{#each COLS as c (c)}<th class={c.startsWith('Red') ? 'red' : 'blue'}>{c}</th>{/each}<th></th></tr></thead>
      <tbody>
        {#each rows as r, i (i)}
          <tr>
            <td><input aria-label="Match {i + 1}" size="6" value={r.matchKey} oninput={e => { r.matchKey = e.currentTarget.value; dirty = true; }} /></td>
            {#each r.teams as t, j (j)}
              <td><input aria-label="Match {i + 1} {COLS[j]}" size="5" inputmode="numeric" value={t} oninput={e => { r.teams[j] = e.currentTarget.value; dirty = true; }} /></td>
            {/each}
            <td><button type="button" class="small danger" aria-label="Remove match {i + 1}" onclick={() => { rows = rows.filter((_, k) => k !== i); dirty = true; }}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="row">
    <button type="button" onclick={addRow}>Add match</button>
    <button type="button" class="primary" disabled={busy} onclick={saveRows}>Save schedule</button>
    {#if dirty}<span class="error">Unsaved changes</span>{/if}
  </div>

  {#if message}<p class="banner ok" role="status">{message}</p>{/if}
  <ErrorNote {error} />
</section>

{#if pendingReplace}
  {@const run = pendingReplace}
  <ConfirmDialog
    title="Replace your unsaved changes?"
    confirmLabel="Replace them"
    cancelLabel="Keep editing"
    onconfirm={() => { const go = run; pendingReplace = null; void go(); }}
    oncancel={() => (pendingReplace = null)}
  >
    <p>You've edited the schedule table without saving. This replaces the table with the new schedule.</p>
  </ConfirmDialog>
{/if}
