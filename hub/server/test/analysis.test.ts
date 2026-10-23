import { markMissed, markNoShow, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { buildCoverage } from '../src/coverage';
import { buildTeamSummaries } from '../src/summaries';

const NOW = '2027-03-01T12:00:00.000Z';

describe('buildCoverage', () => {
  it('marks each slot with the state of its records', () => {
    const f = matchForm();
    const schedule = [
      { matchKey: 'qm1', red: [1, 2, 3] as [number, number, number], blue: [4, 5, 6] as [number, number, number] },
      { matchKey: 'qm2', red: [7, 8, 9] as [number, number, number], blue: [10, 11, 12] as [number, number, number] },
    ];
    const a = record(f, { id: 'a', team: 1, slot: 'red1' });
    const b = record(f, { id: 'b', team: 1, slot: 'red1', scout: 'Bo' });
    const c = markMissed(record(f, { id: 'c', team: 2, slot: 'red2' }), 'climb');
    const d = markNoShow(record(f, { id: 'd', team: 4, slot: 'blue1' }), NOW);
    const e = record(f, { id: 'e', team: 99, matchKey: 'qm3', slot: 'blue3' });
    const pit = record(pitForm(), { id: 'p' });

    const rows = buildCoverage(schedule, [a, b, c, d, e, pit]);
    expect(rows.map(r => [r.matchKey, r.scheduled])).toEqual([['qm1', true], ['qm2', true], ['qm3', false]]);
    expect(rows[0].cells).toEqual({
      red1: { team: 1, status: 'ok', recordIds: ['a', 'b'] },
      red2: { team: 2, status: 'missed', recordIds: ['c'] },
      red3: { team: 3, status: 'empty', recordIds: [] },
      blue1: { team: 4, status: 'noshow', recordIds: ['d'] },
      blue2: { team: 5, status: 'empty', recordIds: [] },
      blue3: { team: 6, status: 'empty', recordIds: [] },
    });
    expect(rows[1].cells.blue3).toEqual({ team: 12, status: 'empty', recordIds: [] });
    expect(rows[2].cells.blue3).toEqual({ team: 99, status: 'ok', recordIds: ['e'] });
    expect(rows[2].cells.red1).toEqual({ team: 0, status: 'empty', recordIds: [] });
  });
});

describe('buildTeamSummaries', () => {
  it('summarizes every team with points, no-shows and pit status', () => {
    const f = matchForm();
    const t1a = setAnswer(setAnswer(record(f, { team: 1 }), 'auto_coral', 2), 'climb', 'deep');
    const t1b = markNoShow(record(f, { team: 1, matchKey: 'qm2' }), NOW);
    const t3 = setAnswer(record(f, { team: 3 }), 'climb', 'none');
    const pit2 = setAnswer(record(pitForm(), { team: 2 }), 'drivetrain', 'swerve');
    const pit1 = markNoShow(record(pitForm(), { team: 1 }), NOW);

    const s = buildTeamSummaries([1, 2], f, [t1a, t1b, t3], [pit2, pit1]);
    expect(s.map(x => x.team)).toEqual([1, 2, 3]);
    expect(s[0]).toMatchObject({
      team: 1, matchRecords: 2, noShows: 1, noShowPct: 0.5, estPoints: 20,
      estPointsBySection: { auto: 8, endgame: 12, notes: null }, pit: 'noshow',
    });
    expect(s[0].stats.auto_coral).toEqual({ kind: 'avg', n: 1, avg: 2, max: 2 });
    expect(s[1]).toMatchObject({ team: 2, matchRecords: 0, noShows: 0, noShowPct: null, estPoints: null, pit: 'done' });
    expect(s[2]).toMatchObject({ team: 3, matchRecords: 1, estPoints: 0, pit: 'none' });
  });

  it('works before any match form is published', () => {
    expect(buildTeamSummaries([1], null, [], [])).toEqual([
      { team: 1, matchRecords: 0, noShows: 0, noShowPct: null, estPoints: null, estPointsBySection: {}, stats: {}, pitStats: {}, pit: 'none' },
    ]);
  });
});
