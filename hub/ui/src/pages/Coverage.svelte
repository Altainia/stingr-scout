<script lang="ts">
  import { matchLabel, SLOTS } from '@stingr/shared';
  import { onMount } from 'svelte';
  import { onHubChange } from '../lib/changes';
  import ErrorNote from '../components/ErrorNote.svelte';
  import MissedConcerns from '../components/MissedConcerns.svelte';
  import { type Api, type CoverageRow, MISSED_CHANGED, type MissedReport } from '../lib/api';
  import { slotLabel } from '../lib/format';

  let { api }: { api: Api } = $props();
  let rows = $state<CoverageRow[] | null>(null);
  let missed = $state<MissedReport | null>(null);
  let error = $state<unknown>(null);

  const SYMBOL = { empty: '', ok: '✓', missed: '⚠', noshow: '✗' } as const;
  const TITLE = { empty: 'Not scouted', ok: 'Scouted', missed: 'Scouted, with missed answers', noshow: 'Robot not present' } as const;

  async function refresh() {
    try {
      [rows, missed] = await Promise.all([api.coverage(), api.missed()]);
      error = null;
    } catch (e) {
      error = e;
    }
  }

  onMount(() => {
    void refresh();
    return onHubChange(refresh); // new records synced: refresh
  });

  let totals = $derived.by(() => {
    const t = { cells: 0, scouted: 0, missed: 0, noshow: 0 };
    for (const r of rows ?? []) {
      for (const s of SLOTS) {
        const c = r.cells[s];
        t.cells++;
        if (c.status !== 'empty') t.scouted++;
        if (c.status === 'missed') t.missed++;
        if (c.status === 'noshow') t.noshow++;
      }
    }
    return t;
  });

  async function change(p: Promise<MissedReport>) {
    try {
      missed = await p;
      window.dispatchEvent(new Event(MISSED_CHANGED));
    } catch (e) {
      error = e;
    }
  }
</script>

<h1>Coverage</h1>
<ErrorNote {error} />

{#if rows}
  {#if rows.length === 0}
    <p class="muted">No schedule yet. <a href="#/event">Import one in Event setup</a>.</p>
  {:else}
    <p>{totals.scouted} of {totals.cells} robot-matches scouted · {totals.missed} with missed answers · {totals.noshow} robots not present</p>
    <p class="muted">✓ scouted · ⚠ has missed answers · ✗ robot not present · 2× scouted by more than one tablet</p>
    {#if missed}
      <section class="card" aria-labelledby="missed-title">
        <h2 id="missed-title">Missed answers</h2>
        {#if !missed.questions.length && !missed.scouts.length}
          <p class="muted">Nothing stands out yet. Questions scouts often miss, and scouts who miss a question much more than others, will show here.</p>
        {/if}
        <MissedConcerns report={missed} onack={id => change(api.ackMissed(id))} onundo={id => change(api.unackMissed(id))} />
      </section>
    {/if}
    <div class="scroll-x">
      <table class="grid">
        <thead>
          <tr><th>Match</th>{#each SLOTS as s (s)}<th class={s.startsWith('red') ? 'red' : 'blue'}>{slotLabel(s)}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each rows as r (r.matchKey)}
            <tr>
              <th scope="row">{matchLabel(r.matchKey)}{#if !r.scheduled} <span class="muted">(not in schedule)</span>{/if}</th>
              {#each SLOTS as s (s)}
                {@const c = r.cells[s]}
                <td class="cell-{c.status}" title={TITLE[c.status]} aria-label="{matchLabel(r.matchKey)} {slotLabel(s)}">
                  {#if c.team}<a href="#/teams/{c.team}">{c.team}</a>{/if}
                  {SYMBOL[c.status]}
                  {#if c.recordIds.length > 1}<span class="tag">{c.recordIds.length}×</span>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}
