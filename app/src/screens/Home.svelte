<script lang="ts">
  import { matchLabel, normalizeMatchKey, SLOTS, type Slot, teamLabel } from '@stingr/shared';
  import { untrack } from 'svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { nextMatchKey, parseTeamInput, slotLabel, teamFor } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();

  const OTHER = '__other';
  let schedule = $derived(store.config?.schedule ?? []);
  let scout = $state(store.settings.scout);
  let slot = $state<Slot>(store.settings.defaultSlot);
  let matchChoice = $state('');
  let otherMatch = $state('');
  let teamOverride = $state<string | null>(null);
  let confirmNoShow = $state(false);
  let busy = $state(false);
  let matchTouched = $state(false); // the scout picked or typed a match themselves

  /** Pick the next match for this tablet; called on open and after recording a no-show. */
  function suggestMatch() {
    const sched = store.config?.schedule ?? [];
    const next = nextMatchKey(sched, store.eventRecords);
    const scheduled = sched.some(m => m.matchKey === next);
    matchChoice = scheduled ? next : OTHER;
    otherMatch = scheduled ? '' : next.startsWith('qm') ? next.slice(2) : next;
    teamOverride = null;
  }
  suggestMatch();

  // A schedule can arrive (first sync) while this screen is open: suggest again unless the scout already chose.
  $effect(() => {
    void schedule.length;
    if (!untrack(() => matchTouched)) untrack(suggestMatch);
  });

  let matchKey = $derived(schedule.length && matchChoice !== OTHER ? matchChoice : normalizeMatchKey(otherMatch));
  let scheduledTeam = $derived(matchKey ? teamFor(schedule, matchKey, slot) : null);
  let teamText = $derived(teamOverride ?? (scheduledTeam === null ? '' : String(scheduledTeam)));
  let team = $derived(parseTeamInput(teamText));
  let teamName = $derived(team === null ? null : (store.config?.teamNames[team] ?? null)); // so the scout can check it's the right robot
  let matchForm = $derived(store.form('match'));
  let canStart = $derived(!!matchForm && !!store.event && scout.trim() !== '' && !!matchKey && team !== null && !busy);

  async function saveScout() {
    if (scout.trim() !== store.settings.scout) await store.saveSettings({ scout: scout.trim() });
  }

  async function start() {
    if (!canStart || !matchKey || team === null) return;
    busy = true;
    try {
      await saveScout();
      await store.startMatch({ matchKey, slot, team });
    } finally {
      busy = false;
    }
  }

  async function noShow() {
    confirmNoShow = false;
    if (!matchKey || team === null) return;
    busy = true;
    try {
      await saveScout();
      await store.matchNoShow({ matchKey, slot, team });
      suggestMatch();
    } finally {
      busy = false;
    }
  }
</script>

<section class="home">
  {#if !store.event}
    <p class="banner warn">No event loaded yet. Plug this tablet into the hub to load the event, forms and schedule.</p>
  {:else if !matchForm}
    <p class="banner warn">The hub hasn't published a match form yet.</p>
  {/if}

  <label class="scout-name">Scouting as
    <input aria-label="Your name" value={scout} autocomplete="off" placeholder="Your name" oninput={e => (scout = e.currentTarget.value)} onchange={saveScout} />
  </label>
  {#if !scout.trim()}<p class="hint">Enter your name to start.</p>{/if}

  <div class="home-grid">
    <section class="card" aria-labelledby="match-title">
      <h2 id="match-title">Match scouting</h2>
      <div class="row">
        {#if schedule.length}
          <label>Match
            <select aria-label="Match" value={matchChoice} onchange={e => { matchChoice = e.currentTarget.value; matchTouched = true; teamOverride = null; }}>
              {#each schedule as m (m.matchKey)}<option value={m.matchKey}>{matchLabel(m.matchKey)}</option>{/each}
              <option value={OTHER}>Other…</option>
            </select>
          </label>
        {/if}
        {#if !schedule.length || matchChoice === OTHER}
          <label>Match number
            <input aria-label="Match number" class="short" value={otherMatch} inputmode="numeric" placeholder="e.g. 12 or sf3m1"
              oninput={e => { otherMatch = e.currentTarget.value; matchTouched = true; teamOverride = null; }} />
          </label>
        {/if}
        <label>Slot
          <select aria-label="Slot" value={slot} onchange={e => { slot = e.currentTarget.value as Slot; teamOverride = null; }}>
            {#each SLOTS as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}
          </select>
        </label>
        <div class="team-field">
          <label>Team
            <input aria-label="Team" class="short" value={teamText} inputmode="numeric" oninput={e => (teamOverride = e.currentTarget.value)} />
          </label>
          <span class="team-name-hint">{teamName ?? ''}</span>
        </div>
      </div>
      {#if slot !== store.settings.defaultSlot}
        <button type="button" class="link" onclick={() => store.saveSettings({ defaultSlot: slot })}>Make {slotLabel(slot)} this tablet's default</button>
      {/if}
      <button type="button" class="primary big wide" disabled={!canStart} onclick={start}>Start scouting</button>
      <div class="secondary-action">
        <button type="button" disabled={!canStart} onclick={() => (confirmNoShow = true)}>Robot not present</button>
      </div>
    </section>

    <div class="side">
      <section class="card" aria-labelledby="pit-title">
        <h2 id="pit-title">Pit scouting</h2>
        <p class="hint">Scout a team's robot in the pits.</p>
        <button type="button" onclick={() => store.go({ name: 'pit' })}>Pit scouting</button>
      </section>
      <section class="card" aria-labelledby="records-title">
        <h2 id="records-title">Past records</h2>
        <p class="hint">{store.records.length} on this tablet</p>
        <button type="button" onclick={() => store.go({ name: 'records' })}>Past records</button>
      </section>
    </div>
  </div>
</section>

{#if confirmNoShow}
  <ConfirmDialog
    title="Robot not present?"
    confirmLabel="Yes, mark as not present"
    cancelLabel="Go back"
    onconfirm={noShow}
    oncancel={() => (confirmNoShow = false)}
  >
    <p>Team {team === null ? '' : teamLabel(team, store.config?.teamNames)} in {matchKey ? matchLabel(matchKey) : ''} ({slotLabel(slot)}) will be recorded as not present. You can undo this from Past records.</p>
  </ConfirmDialog>
{/if}
