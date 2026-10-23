/** An alliance's result for one quantity (its score, or an alliance field), and the teams on it. */
export interface AllianceValue { teams: number[]; value: number | null }

/** A team's estimate is shown only once this many of its alliances have a result. */
export const MIN_ALLIANCE_RESULTS = 3;
/** Keeps the estimate defined while there are still fewer results than teams. Small enough not to bend real data. */
const RIDGE = 1e-3;

/**
 * Each team's estimated share of an alliance-level quantity (OPR): the per-team values that best explain every
 * alliance's total, by least squares (an alliance's value ≈ the sum of its teams' shares).
 * Teams with fewer than MIN_ALLIANCE_RESULTS results get null.
 */
export function estimateShares(results: AllianceValue[]): Map<number, number | null> {
  const teams = [...new Set(results.flatMap(r => r.teams))].sort((a, b) => a - b);
  const index = new Map(teams.map((t, i) => [t, i]));
  const known = results.filter((r): r is AllianceValue & { value: number } => typeof r.value === 'number' && Number.isFinite(r.value));
  const n = teams.length;
  const counts = new Array<number>(n).fill(0);

  // Normal equations (AᵀA + λI) x = Aᵀb, where each row of A marks the teams on one alliance.
  const ata = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const atb = new Array<number>(n).fill(0);
  for (const r of known) {
    const idx = r.teams.map(t => index.get(t) as number);
    for (const i of idx) {
      counts[i]++;
      atb[i] += r.value;
      for (const j of idx) ata[i][j] += 1;
    }
  }
  for (let i = 0; i < n; i++) ata[i][i] += RIDGE;
  const x = solve(ata, atb);
  return new Map(teams.map((t, i) => [t, counts[i] >= MIN_ALLIANCE_RESULTS ? x[i] : null]));
}

/** Gaussian elimination with partial pivoting (the matrix is small: one row per team). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    if (Math.abs(p) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / p;
      if (f) for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}
