export type CompLevel = 'qm' | 'ef' | 'qf' | 'sf' | 'f';
const LEVELS: CompLevel[] = ['qm', 'ef', 'qf', 'sf', 'f'];
const LEVEL_NAMES: Record<CompLevel, string> = { qm: 'Qual', ef: 'Eighth', qf: 'Quarter', sf: 'Semi', f: 'Final' };
const RE = /^(qm|ef|qf|sf|f)(\d+)(?:m(\d+))?$/;

export interface ParsedMatchKey { level: CompLevel; set: number; match: number }

export function parseMatchKey(key: string): ParsedMatchKey | null {
  const m = RE.exec(key);
  if (!m) return null;
  const level = m[1] as CompLevel;
  if (level === 'qm') {
    const match = Number(m[2]);
    return m[3] === undefined && match > 0 ? { level, set: 1, match } : null;
  }
  if (m[3] === undefined) return null;
  const set = Number(m[2]);
  const match = Number(m[3]);
  return set > 0 && match > 0 ? { level, set, match } : null;
}

function formatMatchKey(p: ParsedMatchKey): string {
  return p.level === 'qm' ? `qm${p.match}` : `${p.level}${p.set}m${p.match}`;
}

export function normalizeMatchKey(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 0 ? `qm${n}` : null;
  }
  const p = parseMatchKey(s);
  return p ? formatMatchKey(p) : null;
}

export function compareMatchKeys(a: string, b: string): number {
  const pa = parseMatchKey(a);
  const pb = parseMatchKey(b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : a.localeCompare(b);
  return LEVELS.indexOf(pa.level) - LEVELS.indexOf(pb.level) || pa.set - pb.set || pa.match - pb.match;
}

export function matchLabel(key: string): string {
  const p = parseMatchKey(key);
  if (!p) return key;
  return p.level === 'qm' ? `Qual ${p.match}` : `${LEVEL_NAMES[p.level]} ${p.set}-${p.match}`;
}
