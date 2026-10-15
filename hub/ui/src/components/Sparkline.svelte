<script lang="ts">
  let { values, label, width = 160, height = 40 }: { values: (number | null)[]; label: string; width?: number; height?: number } = $props();

  let points = $derived.by(() => {
    const known = values.flatMap((v, i) => (v === null ? [] : [[i, v] as const]));
    if (!known.length) return [] as { x: number; y: number }[];
    const max = Math.max(...known.map(p => p[1]), 1);
    const min = Math.min(...known.map(p => p[1]), 0);
    const x = (i: number) => (values.length < 2 ? width / 2 : (i / (values.length - 1)) * (width - 8) + 4);
    const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8);
    return known.map(([i, v]) => ({ x: x(i), y: y(v) }));
  });
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label="{label} by match">
  <polyline points={points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--blue)" stroke-width="2" />
  {#each points as p, i (i)}<circle cx={p.x} cy={p.y} r="2.5" fill="var(--blue)" />{/each}
</svg>
