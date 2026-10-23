<script lang="ts">
  import { onMount } from 'svelte';
  import { fmt } from '../lib/chartScale';
  import CompareChart from './CompareChart.svelte';
  import MatchLineChart from './MatchLineChart.svelte';

  // A small chart shown large, with its values as a table. ‹ › (or the arrow keys, unless the chart has them) step
  // through the page's other charts. Escape, a click outside or Close closes it.
  type Match = { label: string; scout: string; state: 'ok' | 'missed' | 'noshow' | 'blank'; value: number | null };
  export type ChartSpec =
    | { kind: 'line'; title: string; matches: Match[]; eventAverage: number | null; refLabel?: string; alliance?: boolean }
    | { kind: 'compare'; title: string; series: { id: string; name: string; slot: number; matches: Match[] }[]; eventAverage: number | null };
  let { charts, index, onclose }: { charts: ChartSpec[]; index: number; onclose: () => void } = $props();

  let at = $state(index);
  let c = $derived(charts[at]);
  let closeButton: HTMLButtonElement | undefined = $state();
  let pressedOutside = false;
  const step = (by: number) => (at = (at + by + charts.length) % charts.length);
  const describe = (m: Match | undefined) =>
    !m ? '—' : m.value !== null ? fmt(m.value) : m.state === 'noshow' ? 'robot not there' : m.state === 'blank' ? 'no answer' : 'missed';
  const nth = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

  onMount(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton?.focus();
    return () => before?.focus?.();
  });

  function key(e: KeyboardEvent) {
    if (e.defaultPrevented || charts.length < 2) return; // a focused chart moves its crosshair instead
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else return;
    e.preventDefault();
  }
</script>

<svelte:document onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); onclose(); } }} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="backdrop"
  role="presentation"
  onpointerdown={e => (pressedOutside = e.target === e.currentTarget)}
  onclick={e => { if (pressedOutside && e.target === e.currentTarget) onclose(); pressedOutside = false; }}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog chart-dialog" role="dialog" aria-modal="true" aria-label={c.title} tabindex="-1" onkeydown={key}>
    <div class="chart-dialog-head">
      <h2>{c.title}</h2>
      {#if charts.length > 1}
        <div class="row">
          <button type="button" class="small" aria-label="Previous chart" onclick={() => step(-1)}>‹</button>
          <span class="muted">{at + 1} of {charts.length}</span>
          <button type="button" class="small" aria-label="Next chart" onclick={() => step(1)}>›</button>
        </div>
      {/if}
    </div>
    {#key at}
      {#if c.kind === 'line'}
        <MatchLineChart large title={c.title} matches={c.matches} eventAverage={c.eventAverage} refLabel={c.refLabel} alliance={c.alliance} />
      {:else}
        <CompareChart large title={c.title} series={c.series} eventAverage={c.eventAverage} />
      {/if}
    {/key}
    <div class="chart-dialog-table">
      <table class="grid" aria-label="{c.title} by match">
        {#if c.kind === 'line'}
          <thead><tr><th>Match</th><th>Scout</th><th>{c.alliance ? 'Alliance' : 'Value'}</th></tr></thead>
          <tbody>
            {#each c.matches as m, i (i)}<tr><td>{m.label}</td><td>{m.scout}</td><td>{describe(m)}</td></tr>{/each}
          </tbody>
        {:else}
          {@const count = Math.max(0, ...c.series.map(s => s.matches.length))}
          <thead><tr><th>Match</th>{#each c.series as s (s.id)}<th title={s.name}>{s.id}</th>{/each}</tr></thead>
          <tbody>
            {#each Array.from({ length: count }, (_, i) => i) as i (i)}
              <tr>
                <td>{nth(i + 1)}</td>
                {#each c.series as s (s.id)}
                  {@const m = s.matches[i]}
                  <td>{describe(m)}{#if m}<span class="muted">{` · ${m.label}`}</span>{/if}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        {/if}
      </table>
    </div>
    <div class="actions"><button type="button" bind:this={closeButton} onclick={onclose}>Close</button></div>
  </div>
</div>
