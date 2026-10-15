import { describe, expect, it } from 'vitest';
import { findQuestion } from '../src/form';
import { markMissed, markNoShow, setAnswer } from '../src/record';
import { estimatedPoints, questionPoints, questionStat, recordPoints } from '../src/scoring';
import type { ScoutRecord } from '../src/types';
import { matchForm, record } from './fixtures';

const f = matchForm();
const q = (key: string) => findQuestion(f, key)!;
const NOW = '2027-03-01T10:00:00.000Z';

function rec(answers: Record<string, unknown>, missed: string[] = []): ScoutRecord {
  let r = record(f);
  for (const [k, v] of Object.entries(answers)) r = setAnswer(r, k, v as never);
  for (const k of missed) r = markMissed(r, k);
  return r;
}

const r1 = rec({ auto_coral: 2, auto_leave: true, climb: 'deep', zones: ['near'], comments: 'fast', start_pos: [{ x: 0.1, y: 0.2 }] });
const r2 = rec({ auto_coral: 4, auto_leave: false, climb: 'none', zones: ['near', 'far'] });
const r3 = rec({ auto_leave: true, climb: 'shallow' }, ['auto_coral']);
const r4 = markNoShow(rec({ auto_coral: 99, climb: 'deep' }), NOW);
const all = [r1, r2, r3, r4];

describe('questionStat', () => {
  it('averages counters, skipping missed answers and no-shows', () => {
    expect(questionStat(q('auto_coral'), all)).toEqual({ kind: 'avg', n: 2, avg: 3, max: 4 });
  });
  it('gives toggles as a fraction', () => {
    expect(questionStat(q('auto_leave'), all)).toEqual({ kind: 'pct', n: 3, pct: 2 / 3 });
  });
  it('counts choice and multi-select options', () => {
    expect(questionStat(q('climb'), all)).toEqual({ kind: 'distribution', n: 3, counts: { deep: 1, none: 1, shallow: 1 } });
    expect(questionStat(q('zones'), all)).toEqual({ kind: 'distribution', n: 2, counts: { near: 2, far: 1 } });
  });
  it('lists text and collects field-map points', () => {
    expect(questionStat(q('comments'), all)).toEqual({ kind: 'list', values: ['fast'] });
    expect(questionStat(q('start_pos'), all)).toEqual({ kind: 'scatter', points: [{ x: 0.1, y: 0.2 }] });
  });
  it('all missed: gives null rather than NaN or 0', () => {
    const missedAll = [rec({ climb: 'deep' }, ['auto_coral']), rec({ climb: 'none' }, ['auto_coral'])];
    expect(questionStat(q('auto_coral'), missedAll)).toEqual({ kind: 'avg', n: 0, avg: null, max: null });
    expect(questionPoints(q('auto_coral'), missedAll)).toBeNull();
    expect(estimatedPoints(f, missedAll).total).toBe(6); // leave 0, climb (12 + 0) / 2
  });
});

describe('points', () => {
  it('estimates average points per match by question and section', () => {
    expect(questionPoints(q('auto_coral'), all)).toBe(12);   // avg 3 × 4
    expect(questionPoints(q('auto_leave'), all)).toBe(2);    // 2/3 × 3
    expect(questionPoints(q('climb'), all)).toBe(6);         // (12 + 0 + 6) / 3
    expect(questionPoints(q('comments'), all)).toBeNull();   // no points configured
    expect(estimatedPoints(f, all)).toEqual({ total: 20, bySection: { auto: 14, endgame: 6, notes: null } });
  });
  it('scores a single record', () => {
    expect(recordPoints(f, r1)).toBe(23); // 2×4 + 3 + 12
    expect(recordPoints(f, r4)).toBeNull(); // no-show
  });
  it('returns null totals when there is nothing to score', () => {
    expect(estimatedPoints(f, [])).toEqual({ total: null, bySection: { auto: null, endgame: null, notes: null } });
  });
});
