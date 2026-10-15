<script lang="ts">
  import { onMount } from 'svelte';
  import type { Api } from '../lib/api';
  import ErrorNote from './ErrorNote.svelte';

  let { api }: { api: Api } = $props();
  let teams = $state<number[]>([]);
  let text = $state('');
  let error = $state<unknown>(null);

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

  onMount(() => { void run(api.teams()); });

  async function add() {
    if (await run(api.addTeam(Number(text.trim().replace(/^frc/i, ''))))) text = '';
  }
</script>

<section class="card">
  <h2>Teams ({teams.length})</h2>
  <p class="hint">Teams come from the schedule. Add any others you want to pit-scout.</p>
  <ul class="chips">
    {#each teams as t (t)}
      <li>{t} <button type="button" class="small" aria-label="Remove team {t}" onclick={() => run(api.removeTeam(t))}>✕</button></li>
    {/each}
  </ul>
  <div class="row">
    <label>Add team <input aria-label="Add team" value={text} inputmode="numeric" oninput={e => (text = e.currentTarget.value)} /></label>
    <button type="button" disabled={!text.trim()} onclick={add}>Add</button>
  </div>
  <ErrorNote {error} />
</section>
