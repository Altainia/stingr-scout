<script lang="ts">
  import { matchLabel, SLOTS } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { Api, CoverageRow } from '../lib/api';
  import { slotLabel } from '../lib/format';

  let { api }: { api: Api } = $props();
  let rows = $state<CoverageRow[] | null>(null);
  let error = $state<unknown>(null);

  const SYMBOL = { empty: '', ok: '✓', missed: '⚠', noshow: '✗' } as const;
  const TITLE = { empty: 'Not scouted', ok: 'Scouted', missed: 'Scouted, with missed answers', noshow: 'Robot not present' } as const;

  async function refresh() {
    try {
      rows = await api.coverage();
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
</script>

<h1>Coverage</h1>
<ErrorNote {error} />

{#if rows}
  {#if rows.length === 0}
    <p class="muted">No schedule yet. <a href="#/event">Import one in Event setup</a>.</p>
  {:else}
    <p>{totals.scouted} of {totals.cells} robot-matches scouted · {totals.missed} with missed answers · {totals.noshow} robots not present</p>
    <p class="muted">✓ scouted · ⚠ has missed answers · ✗ robot not present · 2× scouted by more than one tablet</p>
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
