<script lang="ts">
  import type { ScheduleMatch } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ConfirmDialog from '../../../../app/src/components/ConfirmDialog.svelte';
  import type { Api } from '../lib/api';
  import ErrorNote from './ErrorNote.svelte';

  let { api }: { api: Api } = $props();
  let teams = $state<number[]>([]);
  let text = $state('');
  let error = $state<unknown>(null);
  let schedule = $state<ScheduleMatch[]>([]);
  let confirmTeam = $state<number | null>(null);

  const matchesFor = (team: number) => schedule.filter(m => [...m.red, ...m.blue].includes(team)).length;

  function askRemove(team: number) {
    if (matchesFor(team) > 0) confirmTeam = team; // scheduled teams come back on the next import, so explain first
    else void run(api.removeTeam(team));
  }

  async function run(p: Promise<number[]>): Promise<boolean> {
    error = null;
    try {
      teams = await p;
      return true;
    } catch (e) {
      error = e;
      return false;
    }
  }

  onMount(() => {
    void run(api.teams());
    api.schedule().then(s => { schedule = s; }, e => { error = e; });
  });

  async function add() {
    if (await run(api.addTeam(Number(text.trim().replace(/^frc/i, ''))))) text = '';
  }
</script>

<section class="card">
  <h2>Teams ({teams.length})</h2>
  <p class="hint">Teams come from the schedule. Add any others you want to pit-scout.</p>
  <ul class="chips">
    {#each teams as t (t)}
      <li>{t} <button type="button" class="small danger" aria-label="Remove team {t}" onclick={() => askRemove(t)}>✕</button></li>
    {/each}
  </ul>
  <div class="row">
    <label>Add team <input aria-label="Add team" value={text} inputmode="numeric" oninput={e => (text = e.currentTarget.value)} /></label>
    <button type="button" disabled={!text.trim()} onclick={add}>Add</button>
  </div>
  <ErrorNote {error} />
</section>

{#if confirmTeam !== null}
  {@const n = matchesFor(confirmTeam)}
  <ConfirmDialog
    title="Remove team {confirmTeam}?"
    confirmLabel="Remove"
    cancelLabel="Keep it"
    onconfirm={() => { const t = confirmTeam; confirmTeam = null; if (t !== null) void run(api.removeTeam(t)); }}
    oncancel={() => (confirmTeam = null)}
  >
    <p>Team {confirmTeam} plays in {n} scheduled match{n === 1 ? '' : 'es'}. Removing it only takes it off the pit-scouting list; coverage still shows its matches, and importing the schedule again adds it back.</p>
  </ConfirmDialog>
{/if}
