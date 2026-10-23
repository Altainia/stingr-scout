/** A clean axis from 0 to just above `max`: about four steps of 1, 2 or 5 × a power of ten. */
export function niceAxis(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= rough) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { top, ticks };
}

/** 12, 3.5 — at most one decimal. */
export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "Qual 12" → "Q12" for a compact axis. */
export const shortMatch = (label: string) => label.replace(/^Qual /, 'Q').replace(/^Practice /, 'P');
