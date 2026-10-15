import { summaryKind } from './form';
import { isAnswered } from './record';
import type { AnswerValue, FormDef, Point, Question, ScoutRecord } from './types';

export type QuestionStat =
  | { kind: 'avg'; n: number; avg: number | null; max: number | null }
  | { kind: 'pct'; n: number; pct: number | null }
  | { kind: 'distribution'; n: number; counts: Record<string, number> }
  | { kind: 'list'; values: string[] }
  | { kind: 'scatter'; points: Point[] }
  | { kind: 'none' };

function valueMatchesType(q: Question, v: AnswerValue): boolean {
  switch (q.type) {
    case 'counter': case 'number': case 'rating': case 'timer':
      return typeof v === 'number' && Number.isFinite(v);
    case 'toggle':
      return typeof v === 'boolean';
    case 'choice': case 'text':
      return typeof v === 'string';
    case 'multi':
      return Array.isArray(v) && v.every(x => typeof x === 'string');
    case 'fieldmap':
      return Array.isArray(v) && v.every(p => typeof p === 'object' && p !== null && typeof (p as Point).x === 'number' && typeof (p as Point).y === 'number');
  }
}

export function usableValues(q: Question, records: ScoutRecord[]): AnswerValue[] {
  const out: AnswerValue[] = [];
  for (const r of records) {
    if (r.noShow || r.missed.includes(q.key)) continue;
    const v = r.answers[q.key];
    if (v !== undefined && isAnswered(v) && valueMatchesType(q, v)) out.push(v);
  }
  return out;
}

const mean = (nums: number[]): number | null => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

export function questionStat(q: Question, records: ScoutRecord[]): QuestionStat {
  const vals = usableValues(q, records);
  const kind = summaryKind(q);
  switch (kind) {
    case 'avg': {
      const nums = vals.filter((v): v is number => typeof v === 'number');
      return { kind, n: nums.length, avg: mean(nums), max: nums.length ? Math.max(...nums) : null };
    }
    case 'pct': {
      const bools = vals.filter((v): v is boolean => typeof v === 'boolean');
      return { kind, n: bools.length, pct: bools.length ? bools.filter(Boolean).length / bools.length : null };
    }
    case 'distribution': {
      const counts: Record<string, number> = {};
      for (const v of vals) {
        const items = Array.isArray(v) ? v : [v];
        for (const item of items) if (typeof item === 'string') counts[item] = (counts[item] ?? 0) + 1;
      }
      return { kind, n: vals.length, counts };
    }
    case 'list':
      return { kind, values: vals.map(v => String(v)) };
    case 'scatter':
      return { kind, points: vals.flatMap(v => (Array.isArray(v) ? (v as Point[]) : [])) };
    case 'none':
      return { kind };
  }
}

export function questionPoints(q: Question, records: ScoutRecord[]): number | null {
  if (q.type === 'counter' && q.points !== undefined) {
    const avg = mean(usableValues(q, records) as number[]);
    return avg === null ? null : avg * q.points;
  }
  if (q.type === 'toggle' && q.points !== undefined) {
    const vals = usableValues(q, records);
    return vals.length ? (vals.filter(v => v === true).length / vals.length) * q.points : null;
  }
  if (q.type === 'choice' && q.options.some(o => o.points !== undefined)) {
    const pts = new Map(q.options.map(o => [o.value, o.points ?? 0]));
    return mean(usableValues(q, records).map(v => pts.get(v as string) ?? 0));
  }
  return null;
}

export interface PointsEstimate { total: number | null; bySection: Record<string, number | null> }

export function estimatedPoints(form: FormDef, records: ScoutRecord[]): PointsEstimate {
  const bySection: Record<string, number | null> = {};
  let total: number | null = null;
  for (const s of form.sections) {
    let sec: number | null = null;
    for (const q of s.questions) {
      const p = questionPoints(q, records);
      if (p !== null) sec = (sec ?? 0) + p;
    }
    bySection[s.id] = sec;
    if (sec !== null) total = (total ?? 0) + sec;
  }
  return { total, bySection };
}

export function recordPoints(form: FormDef, rec: ScoutRecord): number | null {
  return estimatedPoints(form, [rec]).total;
}
