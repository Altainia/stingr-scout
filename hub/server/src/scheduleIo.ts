import { normalizeMatchKey, type ScheduleMatch } from '@stingr/shared';

const COLUMNS = ['match', 'red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'];
type Trio = [number, number, number];

export function parseScheduleCsv(text: string): { matches: ScheduleMatch[]; errors: string[] } {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l, i) => ({ n: i + 1, cells: l.split(',').map(c => c.trim()) }))
    .filter(l => l.cells.some(c => c !== ''));
  const matches: ScheduleMatch[] = [];
  const errors: string[] = [];
  if (lines.length === 0) return { matches, errors: ['The file is empty'] };

  let index = COLUMNS.map((_, i) => i);
  if (lines[0].cells.some(c => c.toLowerCase() === 'match')) {
    const header = lines.shift()!.cells.map(c => c.toLowerCase());
    index = COLUMNS.map(c => header.indexOf(c));
    const missing = COLUMNS.filter((_, i) => index[i] < 0);
    if (missing.length) return { matches, errors: [`Missing column(s): ${missing.join(', ')}`] };
  }

  const seen = new Set<string>();
  for (const line of lines) {
    const cell = (i: number) => line.cells[index[i]] ?? '';
    const key = normalizeMatchKey(cell(0));
    if (!key) {
      errors.push(`Line ${line.n}: "${cell(0)}" is not a match number or key`);
      continue;
    }
    const raw = [1, 2, 3, 4, 5, 6].map(i => cell(i).replace(/^frc/i, ''));
    const bad = raw.find(t => !/^\d{1,5}$/.test(t));
    if (bad !== undefined) {
      errors.push(`Line ${line.n}: "${bad}" is not a team number`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`Line ${line.n}: match ${key} appears twice`);
      continue;
    }
    seen.add(key);
    const t = raw.map(Number);
    matches.push({ matchKey: key, red: [t[0], t[1], t[2]], blue: [t[3], t[4], t[5]] });
  }
  return { matches, errors };
}

export function checkScheduleMatch(value: unknown): ScheduleMatch | string {
  if (typeof value !== 'object' || value === null) return 'Each match must be an object';
  const m = value as { matchKey?: unknown; red?: unknown; blue?: unknown };
  const key = typeof m.matchKey === 'string' ? normalizeMatchKey(m.matchKey) : null;
  if (!key) return `"${String(m.matchKey)}" is not a match key`;
  const side = (v: unknown): v is Trio =>
    Array.isArray(v) && v.length === 3 && v.every(t => Number.isInteger(t) && t >= 0 && t <= 99999);
  if (!side(m.red) || !side(m.blue)) return `Match ${key} needs three red and three blue team numbers`;
  return { matchKey: key, red: [...m.red] as Trio, blue: [...m.blue] as Trio };
}
