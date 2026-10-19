<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { arrangePitTeams, parseTeamInput, type PitView, pitStatus, pitTeams } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();

  const LABELS = { none: 'Not scouted', done: 'Done ✓', noshow: 'Team not present' } as const;
  let names = $derived(store.config?.teamNames ?? {});
  let rows = $derived(pitTeams(store.config?.teams ?? [], store.extraTeams, store.eventRecords).map(team => ({ team, status: pitStatus(store.eventRecords, team) })));
  let shown = $derived(arrangePitTeams(rows, names, store.pitView));
  const count = (show: PitView['show']) => (show === 'all' ? rows.length : rows.filter(r => r.status === show).length);
  const CHIPS: [PitView['show'], string][] = [['all', 'All'], ['none', 'Not scouted'], ['done', 'Done'], ['noshow', 'Not present']];
  let pitForm = $derived(store.form('pit'));
  let canScout = $derived(!!pitForm && !!store.event && store.settings.scout.trim() !== '');
  let addText = $state('');
  let confirmTeam = $state<number | null>(null);

  function latestPit(team: number, noShow: boolean) {
    return store.records
      .filter(r => r.rec.kind === 'pit' && r.rec.team === team && r.rec.noShow === noShow && (!store.event || r.rec.eventKey === store.event.key))
      .sort((a, b) => b.rec.updatedAt.localeCompare(a.rec.updatedAt))[0];
  }

  async function add() {
    const team = parseTeamInput(addText);
    if (team === null) return;
    await store.addExtraTeam(team);
    addText = '';
  }

  async function markAbsent() {
    const team = confirmTeam;
    confirmTeam = null;
    if (team !== null) await store.pitNoShow(team);
  }
</script>

<section>
  <header class="bar">
    <h1>Pit scouting</h1>
    <button type="button" onclick={() => store.go({ name: 'home' })}>Back</button>
  </header>
  {#if !pitForm}
    <p class="banner warn">The hub hasn't published a pit form yet.</p>
  {:else if !store.settings.scout.trim()}
    <p class="banner warn">Enter your name on the home screen first.</p>
  {/if}

  <div class="pit-tools">
    <label class="find">Find a team
      <input type="search" aria-label="Find a team" placeholder="Number or name" enterkeyhint="done" value={store.pitView.search}
        oninput={e => (store.pitView.search = e.currentTarget.value)}
        onkeydown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </label>
    <label class="sort">Sort
      <select aria-label="Sort" value={store.pitView.sort} onchange={e => (store.pitView.sort = e.currentTarget.value as PitView['sort'])}>
        <option value="number">Team number</option><option value="name">Name</option><option value="status">Still to do first</option>
      </select>
    </label>
  </div>
  <div class="choices segmented pit-chips" role="group" aria-label="Show">
    {#each CHIPS as [show, label] (show)}
      <button type="button" aria-pressed={store.pitView.show === show} onclick={() => (store.pitView.show = show)}>{label} {count(show)}</button>
    {/each}
  </div>

  {#if shown.length === 0}<p class="hint">No teams match.</p>{/if}
  <ul class="list">
    {#each shown as { team: t, status } (t)}
      <li aria-label="Team {t}">
        <strong class="team-no">{t}</strong>
        <span class="team-name" class:muted={!names[t]}>{names[t] ?? '—'}</span>
        <span class="grow status {status}">{LABELS[status]}</span>
        {#if status === 'none'}
          <button type="button" class="primary" disabled={!canScout} onclick={() => store.startPit(t)}>Scout</button>
          <button type="button" disabled={!canScout} onclick={() => (confirmTeam = t)}>Not present</button>
        {:else if status === 'noshow'}
          <button type="button" disabled={!canScout} onclick={() => { const r = latestPit(t, true); if (r) void store.undoNoShow(r.id, 'pit'); }}>Undo / scout anyway</button>
        {:else}
          <button type="button" onclick={() => { const r = latestPit(t, false); if (r) void store.editRecord(r.id, 'pit'); }}>Edit</button>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="row">
    <label>Add a team <input aria-label="Add a team" value={addText} inputmode="numeric" oninput={e => (addText = e.currentTarget.value)} /></label>
    <button type="button" onclick={add}>Add</button>
  </div>
</section>

{#if confirmTeam !== null}
  <ConfirmDialog
    title="Team {confirmTeam} not present?"
    confirmLabel="Yes, not present"
    cancelLabel="Go back"
    onconfirm={markAbsent}
    oncancel={() => (confirmTeam = null)}
  >
    <p>You won't need to answer pit questions for this team. You can undo this.</p>
  </ConfirmDialog>
{/if}
