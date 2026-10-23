<script lang="ts">
  import { fmt, niceAxis, shortMatch } from '../lib/chartScale';

  // One numeric question across a team's matches, beside the event's average. The line breaks where a value is
  // missing (missed, or the robot wasn't there), and the gap is marked, so it never reads as a zero.
  type Match = { label: string; scout: string; state: 'ok' | 'missed' | 'noshow' | 'blank'; value: number | null };
  let { title, matches, eventAverage }: { title: string; matches: Match[]; eventAverage: number | null } = $props();

  const W = 320;
  const H = 170;
  const M = { top: 12, right: 74, bottom: 24, left: 30 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  let axis = $derived(niceAxis(Math.max(eventAverage ?? 0, ...matches.map(m => m.value ?? 0))));
  const x = (i: number) => M.left + (matches.length < 2 ? plotW / 2 : (i / (matches.length - 1)) * plotW);
  const y = (v: number) => M.top + plotH - (v / axis.top) * plotH;

  // Runs of consecutive known values, each drawn as its own line.
  let runs = $derived.by(() => {
    const out: string[] = [];
    let cur: string[] = [];
    matches.forEach((m, i) => {
      if (m.value === null) {
        if (cur.length) out.push(cur.join(' '));
        cur = [];
      } else cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.value).toFixed(1)}`);
    });
    if (cur.length) out.push(cur.join(' '));
    return out;
  });

  let active = $state<number | null>(null);
  let svg: SVGSVGElement | undefined = $state();
  const scale = () => (svg ? svg.getBoundingClientRect().width / W || 1 : 1);
  /** The crosshair snaps to the nearest match. */
  function track(e: PointerEvent) {
    const r = svg?.getBoundingClientRect();
    if (!r || !matches.length) return;
    const px = ((e.clientX - r.left) / (r.width || 1)) * W;
    let best = 0;
    matches.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    active = best;
  }
  function key(e: KeyboardEvent) {
    if (!matches.length) return;
    if (e.key === 'ArrowRight') active = Math.min((active ?? -1) + 1, matches.length - 1);
    else if (e.key === 'ArrowLeft') active = Math.max((active ?? 1) - 1, 0);
    else return;
    e.preventDefault();
  }
  const describe = (m: Match) => (m.value !== null ? fmt(m.value) : m.state === 'noshow' ? 'robot not there' : m.state === 'blank' ? 'no answer' : 'missed');
  let known = $derived(matches.flatMap(m => (m.value === null ? [] : [m.value])));
  let summary = $derived(`${title} by match: ${matches.map(m => `${m.label} ${describe(m)}`).join(', ')}${eventAverage !== null ? `. Event average ${fmt(eventAverage)}` : ''}`);
  let every = $derived(Math.max(1, Math.ceil(matches.length / 6)));
</script>

<div class="chart line-chart">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <svg bind:this={svg} viewBox="0 0 {W} {H}" role="img" aria-label={summary} tabindex="0"
    onpointermove={track} onpointerleave={() => (active = null)} onfocus={() => (active ??= 0)} onblur={() => (active = null)} onkeydown={key}>
    <g class="grid">{#each axis.ticks as t (t)}<line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />{/each}</g>
    <g class="axis">
      {#each axis.ticks as t (t)}<text x={M.left - 5} y={y(t) + 4} text-anchor="end">{fmt(t)}</text>{/each}
      {#each matches as m, i (i)}{#if i % every === 0}<text x={x(i)} y={H - 6} text-anchor="middle">{shortMatch(m.label)}</text>{/if}{/each}
    </g>
    {#if eventAverage !== null}
      <g class="ref">
        <line x1={M.left} x2={M.left + plotW} y1={y(eventAverage)} y2={y(eventAverage)} />
        <text x={M.left + plotW + 6} y={y(eventAverage) + 4}>Event avg {fmt(eventAverage)}</text>
      </g>
    {/if}
    {#if active !== null}<line class="crosshair" x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} />{/if}
    {#each runs as d, i (i)}<path class="line" {d} />{/each}
    {#each matches as m, i (i)}
      {#if m.value !== null}
        <circle class="dot" cx={x(i)} cy={y(m.value)} r={active === i ? 5.5 : 4} />
      {:else}
        <text class="gap" x={x(i)} y={y(0) - 5} text-anchor="middle">{m.state === 'noshow' ? '✗' : m.state === 'blank' ? '–' : '⚠'}</text>
      {/if}
    {/each}
  </svg>
  {#if active !== null && matches[active]}
    {@const m = matches[active]}
    <div class="chart-tip" role="tooltip" style:left="{x(active) * scale()}px" style:top="{(m.value !== null ? y(m.value) : y(0)) * scale()}px">
      <div><strong>{m.label}</strong> <span class="muted">· {m.scout}</span></div>
      {#if m.value !== null}
        <div class="row"><span class="key" style:background="var(--chart-1)"></span><strong>{describe(m)}</strong></div>
      {:else}
        <div><strong>{describe(m)}</strong></div>
      {/if}
      {#if eventAverage !== null}<div class="muted">Event avg {fmt(eventAverage)}</div>{/if}
    </div>
  {/if}
  {#if known.length}
    <p class="hint">Team avg {fmt(known.reduce((a, b) => a + b, 0) / known.length)} over {known.length} {known.length === 1 ? 'match' : 'matches'}</p>
  {/if}
</div>
