<script lang="ts">
  import { matchLabel, SLOTS } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { Api, CoverageRow, MissedRef, MissedReport } from '../lib/api';
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
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
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

  const pct = (n: number, of: number) => `${of ? Math.round((100 * n) / of) : 0}%`;
  const where = (m: MissedRef) => `${matchLabel(m.matchKey)}${m.slot ? ` · ${slotLabel(m.slot)}` : ''} · Team ${m.team} (${m.scout})`;
</script>

{#snippet matchList(matches: MissedRef[])}
  <details>
    <summary>Show the matches</summary>
    <ul class="muted">{#each matches as m, i (i)}<li>{where(m)}</li>{/each}</ul>
  </details>
{/snippet}

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
        {#if missed.questions.length}
          <h3>Questions scouts often miss</h3>
          <p class="hint">It may be hard to see from the stands, or unclear. Consider rewording it or giving it a help text.</p>
          <ul class="missed-list">
            {#each missed.questions as q (q.key)}
              <li>
                <strong>{q.label}</strong>: missed in {q.missed} of {q.total} matches ({pct(q.missed, q.total)}), by {q.scouts} of {q.scoutsAsked} scouts
                {@render matchList(q.matches)}
              </li>
            {/each}
          </ul>
        {/if}
        {#if missed.scouts.length}
          <h3>Scouts who miss a question more than others</h3>
          <p class="hint">They may need a pointer on what to watch for, or a different position.</p>
          <ul class="missed-list">
            {#each missed.scouts as s (`${s.scout}|${s.key}`)}
              <li>
                <strong>{s.scout}</strong> misses {s.label} in {s.missed} of {s.total} matches ({pct(s.missed, s.total)}); other scouts {s.othersMissed} of {s.othersTotal} ({pct(s.othersMissed, s.othersTotal)})
                {@render matchList(s.matches)}
              </li>
            {/each}
          </ul>
        {/if}
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
