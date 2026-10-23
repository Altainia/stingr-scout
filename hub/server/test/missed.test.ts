import { markMissed, markNoShow, type ScoutRecord } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, record } from '../../../shared/test/fixtures';
import { buildMissedReport } from '../src/missed';
import { makeApp, setupEvent } from './helpers';

const form = matchForm();
const formOf = () => form;
let n = 0;
/** A match record by `scout`, missing the given questions. */
const rec = (scout: string, missed: string[] = []): ScoutRecord => {
  let r = record(form, { scout, matchKey: `qm${++n}`, team: 100 + n });
  for (const k of missed) r = markMissed(r, k);
  return r;
};

describe('buildMissedReport', () => {
  it('lists a question many scouts miss, with how often and by how many scouts', () => {
    const records = [
      rec('Ada', ['climb_time']), rec('Ben', ['climb_time']), rec('Cy', ['climb_time']), rec('Di'), rec('Ada'), rec('Ben'),
      rec('Cy'), rec('Di'), rec('Ada'), rec('Ben'),
    ];
    const { questions } = buildMissedReport(records, formOf, form);
    expect(questions).toEqual([expect.objectContaining({ key: 'climb_time', label: 'Climb time', missed: 3, total: 10, scouts: 3, scoutsAsked: 4 })]);
    expect(questions[0].matches.map(m => m.scout)).toEqual(['Ada', 'Ben', 'Cy']);
  });

  it("doesn't list a question as hard when its misses are mostly one scout's", () => {
    const records = [
      ...Array.from({ length: 6 }, () => rec('Ben', ['defense'])), rec('Ben'),
      rec('Cy', ['defense']), ...Array.from({ length: 34 }, (_, i) => rec(['Ada', 'Cy', 'Di', 'Eve', 'Flo'][i % 5])),
    ];
    const report = buildMissedReport(records, formOf, form);
    expect(report.questions).toEqual([]); // without Ben, 1 of 35
    expect(report.scouts.map(s => s.scout)).toEqual(['Ben']); // it's Ben's to look at
  });

  it("doesn't list a question only one scout misses, or one missed rarely", () => {
    const one = [rec('Ada', ['climb_time']), rec('Ada', ['climb_time']), rec('Ben'), rec('Cy')];
    expect(buildMissedReport(one, formOf, form).questions).toEqual([]); // 50%, but one scout
    const rare = [rec('Ada', ['climb_time']), rec('Ben', ['climb_time']), ...Array.from({ length: 12 }, () => rec('Cy'))];
    expect(buildMissedReport(rare, formOf, form).questions).toEqual([]); // 2 of 14 is under 15%
  });

  it('lists a scout who misses a question far more than the others', () => {
    const records = [
      ...Array.from({ length: 6 }, () => rec('Ben', ['defense'])), rec('Ben'), rec('Ben'),
      rec('Ada', ['defense']), ...Array.from({ length: 9 }, () => rec('Ada')), ...Array.from({ length: 10 }, () => rec('Cy')),
    ];
    const { scouts } = buildMissedReport(records, formOf, form);
    expect(scouts).toEqual([expect.objectContaining({ scout: 'Ben', key: 'defense', label: 'Defense rating', missed: 6, total: 8, othersMissed: 1, othersTotal: 20 })]);
    expect(scouts[0].matches).toHaveLength(6);
  });

  it('needs enough matches, a high enough rate, and twice the others, before listing a scout', () => {
    const few = [rec('Ben', ['defense']), rec('Ben', ['defense']), rec('Ben', ['defense']), ...Array.from({ length: 5 }, () => rec('Ada'))];
    expect(buildMissedReport(few, formOf, form).scouts).toEqual([]); // only 3 of Ben's matches
    const all = [...Array.from({ length: 4 }, () => rec('Ben', ['defense'])), ...Array.from({ length: 4 }, () => rec('Ada', ['defense']))];
    expect(buildMissedReport(all, formOf, form).scouts).toEqual([]); // everyone misses it: a question problem, not a scout one
  });

  it('counts a scout name the same whatever its capitals or spaces, and leaves out robots that were not there', () => {
    const records = [rec('Ada', ['climb_time']), rec(' ada ', ['climb_time']), rec('Ben', ['climb_time']), markNoShow(rec('Cy'), '2027-03-01T10:00:00.000Z'), rec('Cy')];
    const q = buildMissedReport(records, formOf, form).questions[0];
    expect(q).toMatchObject({ missed: 3, total: 4, scouts: 2, scoutsAsked: 3 });
  });

  it('only counts records whose form version asked the question', () => {
    const old = { ...form, version: 0, sections: form.sections.map(s => ({ ...s, questions: s.questions.filter(q => q.key !== 'climb_time') })) };
    const records = [rec('Ada', ['climb_time']), rec('Ben', ['climb_time']), { ...rec('Cy'), formVersion: 0 }, { ...rec('Di'), formVersion: 0 }];
    const q = buildMissedReport(records, v => (v === 0 ? old : form), form).questions[0];
    expect(q).toMatchObject({ missed: 2, total: 2 });
  });
});

describe('GET /api/missed', () => {
  it("reports on the current event's match records", async () => {
    const app = await makeApp();
    await setupEvent(app);
    const res = await app.inject({ url: '/api/missed' });
    expect(res.json()).toEqual({ questions: [], scouts: [] });
  });
});
