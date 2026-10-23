<script lang="ts">
  import { fmt, niceAxis } from '../lib/chartScale';

  // Several teams side by side: each team's matches in its own order (1st, 2nd, 3rd…), a line per team in the colour it
  // keeps, beside the event's average. Gaps (missed, robot not there, no answer) break the line and are marked.
  type Match = { label: string; scout: string; state: 'ok' | 'missed' | 'noshow' | 'blank'; value: number | null };
  type Series = { id: string; name: string; slot: number; matches: Match[] };
  let { title, series, eventAverage, wide = false, legend = true }: {
    title: string; series: Series[]; eventAverage: number | null; wide?: boolean;
    /** off for small multiples, which share one legend */
    legend?: boolean;
  } = $props();

  let W = $derived(wide ? 640 : 340);
  const H = 190;
  const M = { top: 12, right: 92, bottom: 24, left: 32 };
  let plotW = $derived(W - M.left - M.right);
  const plotH = H - M.top - M.bottom;

  let count = $derived(Math.max(1, ...series.map(s => s.matches.length)));
  let axis = $derived(niceAxis(Math.max(eventAverage ?? 0, ...series.flatMap(s => s.matches.map(m => m.value ?? 0)))));
  const x = (i: number) => M.left + (count < 2 ? plotW / 2 : (i / (count - 1)) * plotW);
  const y = (v: number) => M.top + plotH - (v / axis.top) * plotH;
  const colour = (slot: number) => `var(--chart-${slot})`;
  const nth = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const describe = (m: Match) => (m.value !== null ? fmt(m.value) : m.state === 'noshow' ? 'robot not there' : m.state === 'blank' ? 'no answer' : 'missed');

  // Each team's runs of consecutive known values, drawn as separate lines.
  function runs(s: Series): string[] {
    const out: string[] = [];
    let cur: string[] = [];
    s.matches.forEach((m, i) => {
      if (m.value === null) {
        if (cur.length) out.push(cur.join(' '));
        cur = [];
      } else cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.value).toFixed(1)}`);
    });
    if (cur.length) out.push(cur.join(' '));
    return out;
  }

  // Labels in the right margin (each team at its last value, and the event average), nudged apart so none overlap.
  let marginLabels = $derived.by(() => {
    const labels = series.flatMap(s => {
      const last = s.matches.findLast(m => m.value !== null);
      return last?.value !== undefined && last.value !== null ? [{ key: s.id, text: s.id, y: y(last.value) + 4, slot: s.slot as number | null, cls: 'end-label' }] : [];
    });
    if (eventAverage !== null) labels.push({ key: 'avg', text: `Event avg ${fmt(eventAverage)}`, y: y(eventAverage) + 4, slot: null, cls: 'avg-label' });
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
    return labels;
  });

  let active = $state<number | null>(null);
  let svg: SVGSVGElement | undefined = $state();
  const scale = () => (svg ? svg.getBoundingClientRect().width / W || 1 : 1);
  function track(e: PointerEvent) {
    const r = svg?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / (r.width || 1)) * W;
    let best = 0;
    for (let i = 1; i < count; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    active = best;
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') active = Math.min((active ?? -1) + 1, count - 1);
    else if (e.key === 'ArrowLeft') active = Math.max((active ?? 1) - 1, 0);
    else return;
    e.preventDefault();
  }
  let summary = $derived(`${title}, compared: ${series.map(s => `${s.name}: ${s.matches.map(describe).join(', ') || 'no matches'}`).join('; ')}${eventAverage !== null ? `. Event average ${fmt(eventAverage)}` : ''}`);
  let every = $derived(Math.max(1, Math.ceil(count / (wide ? 12 : 6))));
</script>

<div class="chart compare-chart" class:line-chart={!wide}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <svg bind:this={svg} viewBox="0 0 {W} {H}" role="img" aria-label={summary} tabindex="0"
    onpointermove={track} onpointerleave={() => (active = null)} onfocus={() => (active ??= 0)} onblur={() => (active = null)} onkeydown={key}>
    <g class="grid">{#each axis.ticks as t (t)}<line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />{/each}</g>
    <g class="axis">
      {#each axis.ticks as t (t)}<text x={M.left - 5} y={y(t) + 4} text-anchor="end">{fmt(t)}</text>{/each}
      {#each Array.from({ length: count }, (_, i) => i) as i (i)}{#if i % every === 0}<text x={x(i)} y={H - 6} text-anchor="middle">{nth(i + 1)}</text>{/if}{/each}
    </g>
    {#if eventAverage !== null}<g class="ref"><line x1={M.left} x2={M.left + plotW} y1={y(eventAverage)} y2={y(eventAverage)} /></g>{/if}
    {#if active !== null}<line class="crosshair" x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} />{/if}
    {#each series as s (s.id)}
      {#each runs(s) as d, i (i)}<path class="line" data-team={s.id} {d} style:stroke={colour(s.slot)} />{/each}
      {#each s.matches as m, i (i)}
        {#if m.value !== null}
          <circle class="dot" cx={x(i)} cy={y(m.value)} r={active === i ? 5.5 : 4} style:fill={colour(s.slot)} />
        {:else}
          <text class="gap" x={x(i)} y={y(0) - 5} text-anchor="middle" style:fill={colour(s.slot)}>{m.state === 'noshow' ? '✗' : m.state === 'blank' ? '–' : '⚠'}</text>
        {/if}
      {/each}
    {/each}
    <g class="ref">
      {#each marginLabels as l (l.key)}<text class={l.cls} x={M.left + plotW + 8} y={l.y}>{l.text}</text>{/each}
    </g>
  </svg>
  {#if active !== null}
    <!-- Beside the crosshair, inside the chart; on the left of it in the right half, so it stays on the card. -->
    {@const flip = x(active) > W / 2}
    <div class="chart-tip beside" class:flip role="tooltip" style:top="{M.top * scale()}px"
      style:left={flip ? null : `${x(active) * scale()}px`} style:right={flip ? `${(W - x(active)) * scale()}px` : null}>
      <div><strong>{nth(active + 1)} match</strong></div>
      {#each series as s (s.id)}
        {@const m = s.matches[active]}
        <div class="row"><span class="key" style:background={colour(s.slot)}></span><strong>{m ? describe(m) : '—'}</strong> {s.name} <span class="muted">{m ? m.label : 'no match yet'}</span></div>
      {/each}
      {#if eventAverage !== null}<div class="muted">Event avg {fmt(eventAverage)}</div>{/if}
    </div>
  {/if}
  {#if legend}<ul class="chart-legend" aria-label="Teams">
    {#each series as s (s.id)}<li><span class="line-key" style:background={colour(s.slot)}></span>{s.name}</li>{/each}
    {#if eventAverage !== null}<li><span class="ref-key"></span>Event average</li>{/if}
  </ul>{/if}
</div>
