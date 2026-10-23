<script lang="ts">
  import { fmt, niceAxis, shortMatch } from '../lib/chartScale';

  // A column per match: the robot's estimated points, stacked by form section, beside the event's average.
  // Missed answers and robots that weren't there leave a marked gap, never a zero.
  type Match = { label: string; scout: string; state: 'ok' | 'missed' | 'noshow'; sections: (number | null)[] };
  type Alliance = { score: number | null; opponent: number | null };
  let { matches, sections, eventAverage, alliance = [] }: {
    matches: Match[]; sections: { id: string; title: string }[]; eventAverage: number | null;
    /** the team's alliance in each match (from Alliance results): drawn as a faint column behind, with the result */
    alliance?: Alliance[];
  } = $props();

  const W = 640;
  const H = 230;
  const M = { top: 12, right: 92, bottom: 26, left: 34 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const GAP = 2; // surface gap between stacked segments

  const total = (m: Match) => (m.state === 'ok' ? m.sections.reduce<number>((a, v) => a + (v ?? 0), 0) : null);
  let hasAlliance = $derived(alliance.some(a => a.score !== null));
  let axis = $derived(niceAxis(Math.max(eventAverage ?? 0, ...matches.map(m => total(m) ?? 0), ...alliance.map(a => a.score ?? 0))));
  let allianceW = $derived(Math.min(40, band * 0.85));
  const result = (a: Alliance | undefined) =>
    a?.score === null || a?.score === undefined || a.opponent === null ? null : a.score > a.opponent ? 'W' : a.score < a.opponent ? 'L' : 'T';
  const resultWord = { W: 'won', L: 'lost', T: 'tied' } as const;
  const allianceLine = (a: Alliance) => {
    const r = result(a);
    return `Alliance ${fmt(a.score ?? 0)}${a.opponent !== null ? ` · opponents ${fmt(a.opponent)}` : ''}${r ? ` (${resultWord[r]})` : ''}`;
  };
  let band = $derived(plotW / Math.max(matches.length, 1));
  let barW = $derived(Math.min(24, band * 0.6));
  const y = (v: number) => M.top + plotH - (v / axis.top) * plotH;
  const cx = (i: number) => M.left + band * (i + 0.5);
  const colour = (s: number) => `var(--chart-${(s % 8) + 1})`;
  // Only sections that score points get a colour and a legend entry.
  let scoring = $derived(sections.map((s, i) => ({ ...s, i })).filter(s => matches.some(m => (m.sections[s.i] ?? 0) > 0)));

  /** A segment: rounded only at the data end (the top of the stack). */
  function segment(x: number, top: number, bottom: number, roundTop: boolean): string {
    const h = Math.max(bottom - top, 0);
    const r = roundTop ? Math.min(4, h, barW / 2) : 0;
    return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${bottom} Z`;
  }

  let stacks = $derived(matches.map((m, i) => {
    if (m.state !== 'ok') return [];
    let base = 0;
    const parts = scoring.map(s => ({ s: s.i, v: m.sections[s.i] ?? 0 })).filter(p => p.v > 0);
    return parts.map((p, k) => {
      const bottom = y(base) - (k > 0 ? GAP : 0);
      base += p.v;
      return { s: p.s, d: segment(cx(i) - barW / 2, y(base), bottom, k === parts.length - 1) };
    });
  }));

  let active = $state<number | null>(null);
  let wrap: HTMLElement | undefined = $state();
  let tipX = $state(0);
  let tipY = $state(0);
  function show(i: number) {
    active = i;
    const svg = wrap?.querySelector('svg');
    const scale = svg ? svg.getBoundingClientRect().width / W || 1 : 1;
    tipX = cx(i) * scale;
    tipY = y(total(matches[i]) ?? 0) * scale;
  }
  const describe = (m: Match) => (m.state === 'noshow' ? 'robot not there' : m.state === 'missed' ? 'missed' : `${fmt(total(m) ?? 0)} points`);
  let summary = $derived(`Points per match: ${matches.map(m => `${m.label} ${describe(m)}`).join(', ')}${eventAverage !== null ? `. Event average ${fmt(eventAverage)}` : ''}`);
  // Axis labels thin out when there are many matches, so they never collide.
  let every = $derived(Math.max(1, Math.ceil(matches.length / 12)));
</script>

<div class="chart" bind:this={wrap}>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={summary}>
    <g class="grid">{#each axis.ticks as t (t)}<line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />{/each}</g>
    <g class="axis">
      {#each axis.ticks as t (t)}<text x={M.left - 6} y={y(t) + 4} text-anchor="end">{fmt(t)}</text>{/each}
      {#each matches as m, i (i)}{#if i % every === 0}<text x={cx(i)} y={H - 8} text-anchor="middle">{shortMatch(m.label)}</text>{/if}{/each}
    </g>
    {#each alliance as a, i (i)}
      {#if a.score !== null && i < matches.length}
        <rect class="alliance-col" x={cx(i) - allianceW / 2} y={y(a.score)} width={allianceW} height={y(0) - y(a.score)} rx="3" />
      {/if}
      {#if result(a) && i < matches.length}
        <text class="result" x={cx(i)} y={y(Math.max(a.score ?? 0, total(matches[i]) ?? 0)) - 5} text-anchor="middle">{result(a)}</text>
      {/if}
    {/each}
    {#each stacks as parts, i (i)}
      {#each parts as p (p.s)}<path class="segment" d={p.d} fill={colour(p.s)} opacity={active === null || active === i ? 1 : 0.55} />{/each}
      {#if matches[i].state !== 'ok'}
        <text class="gap" x={cx(i)} y={y(0) - 6} text-anchor="middle">{matches[i].state === 'noshow' ? '✗' : '⚠'}</text>
      {/if}
    {/each}
    {#if eventAverage !== null}
      <g class="ref">
        <line x1={M.left} x2={M.left + plotW} y1={y(eventAverage)} y2={y(eventAverage)} />
        <text x={M.left + plotW + 6} y={y(eventAverage) + 4}>Event avg {fmt(eventAverage)}</text>
      </g>
    {/if}
    {#each matches as m, i (i)}
      <rect class="hit" role="button" tabindex="0" aria-label="{m.label}: {describe(m)}" x={M.left + band * i} y={M.top} width={band} height={plotH}
        onpointerenter={() => show(i)} onpointerleave={() => (active = null)} onfocus={() => show(i)} onblur={() => (active = null)} />
    {/each}
  </svg>
  {#if active !== null}
    {@const m = matches[active]}
    <div class="chart-tip" role="tooltip" style:left="{tipX}px" style:top="{tipY}px">
      <div><strong>{m.label}</strong> <span class="muted">· {m.scout}</span></div>
      <div><strong>{describe(m)}</strong></div>
      {#if alliance[active]?.score !== null && alliance[active]?.score !== undefined}
        <div class="muted">{allianceLine(alliance[active])}</div>
      {/if}
      {#if m.state === 'ok'}
        {#each scoring as s (s.id)}
          <div class="row"><span class="key" style:background={colour(s.i)}></span><strong>{fmt(m.sections[s.i] ?? 0)}</strong> {s.title}</div>
        {/each}
      {/if}
    </div>
  {/if}
  <ul class="chart-legend" aria-label="Sections">
    {#each scoring as s (s.id)}<li><span class="swatch" style:background={colour(s.i)}></span>{s.title}</li>{/each}
    {#if hasAlliance}<li><span class="swatch alliance-swatch"></span>Alliance score</li>{/if}
    {#if eventAverage !== null}<li class="ref-item"><span class="ref-key"></span>Event average</li>{/if}
  </ul>
  <details>
    <summary>Show as a table</summary>
    <table class="grid" aria-label="Points by section">
      <thead><tr><th>Match</th><th>Scout</th>{#each scoring as s (s.id)}<th>{s.title}</th>{/each}<th>Total</th>{#if hasAlliance}<th>Alliance</th><th>Opponents</th>{/if}</tr></thead>
      <tbody>
        {#each matches as m, i (i)}
          <tr>
            <td>{m.label}</td><td>{m.scout}</td>
            {#if m.state === 'ok'}
              {#each scoring as s (s.id)}<td>{fmt(m.sections[s.i] ?? 0)}</td>{/each}<td><strong>{fmt(total(m) ?? 0)}</strong></td>
            {:else}
              <td colspan={scoring.length + 1} class="muted">{m.state === 'noshow' ? 'not there' : 'missed'}</td>
            {/if}
            {#if hasAlliance}
              <td>{alliance[i]?.score ?? '—'}</td><td>{alliance[i]?.opponent ?? '—'}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
</div>
