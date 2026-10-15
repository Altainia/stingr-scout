import { markNoShow, type ScheduleMatch } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../shared/test/fixtures';
import {
  formVersion, latestForm, nextMatchKey, parseTeamInput, pitStatus, pitTeams, recordTitle, slotLabel, teamFor,
} from '../src/lib/session';

const schedule: ScheduleMatch[] = [
  { matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] },
  { matchKey: 'qm1', red: [5098, 0, 3], blue: [4, 5, 6] },
  { matchKey: 'qm10', red: [1, 2, 3], blue: [4, 5, 6] },
];
const NOW = '2027-03-01T11:00:00.000Z';

describe('slots and teams', () => {
  it('labels slots', () => {
    expect(slotLabel('red2')).toBe('Red 2');
    expect(slotLabel('blue3')).toBe('Blue 3');
  });
  it('finds the scheduled team for a slot', () => {
    expect(teamFor(schedule, 'qm1', 'red1')).toBe(5098);
    expect(teamFor(schedule, 'qm1', 'blue2')).toBe(5);
    expect(teamFor(schedule, 'qm1', 'red2')).toBeNull(); // team 0 = unknown
    expect(teamFor(schedule, 'qm9', 'red1')).toBeNull();
  });
  it('parses typed team numbers', () => {
    expect(parseTeamInput(' frc254 ')).toBe(254);
    expect(parseTeamInput('5098')).toBe(5098);
    expect(parseTeamInput('0')).toBeNull();
    expect(parseTeamInput('abc')).toBeNull();
    expect(parseTeamInput('')).toBeNull();
  });
});

describe('nextMatchKey', () => {
  const at = (matchKey: string) => record(matchForm(), { matchKey });
  it('starts at the first scheduled match', () => {
    expect(nextMatchKey(schedule, [])).toBe('qm1');
  });
  it('moves past the latest match this tablet scouted, in match order', () => {
    expect(nextMatchKey(schedule, [at('qm1')])).toBe('qm2');
    expect(nextMatchKey(schedule, [at('qm1'), at('qm2')])).toBe('qm10');
    expect(nextMatchKey(schedule, [at('qm10')])).toBe('qm10');
  });
  it('counts up without a schedule', () => {
    expect(nextMatchKey([], [])).toBe('qm1');
    expect(nextMatchKey([], [at('qm7')])).toBe('qm8');
  });
  it('ignores pit records', () => {
    expect(nextMatchKey(schedule, [record(pitForm())])).toBe('qm1');
  });
});

describe('forms', () => {
  it('picks the latest or a specific version', () => {
    const forms = [matchForm(1), matchForm(3), pitForm(1)];
    expect(latestForm(forms, 'match')?.version).toBe(3);
    expect(latestForm(forms, 'pit')?.version).toBe(1);
    expect(latestForm([], 'pit')).toBeNull();
    expect(formVersion(forms, 'match', 1)?.version).toBe(1);
    expect(formVersion(forms, 'match', 2)).toBeNull();
  });
});

describe('pit scouting', () => {
  it("reports each team's pit status", () => {
    const recs = [record(pitForm(), { team: 1 }), markNoShow(record(pitForm(), { team: 2 }), NOW)];
    expect(pitStatus(recs, 1)).toBe('done');
    expect(pitStatus(recs, 2)).toBe('noshow');
    expect(pitStatus(recs, 3)).toBe('none');
  });
  it('lists event, added and already-scouted teams once each', () => {
    expect(pitTeams([3, 1], [9, 1], [record(pitForm(), { team: 7 })])).toEqual([1, 3, 7, 9]);
  });
});

describe('recordTitle', () => {
  it('describes match and pit records', () => {
    expect(recordTitle(record(matchForm()))).toBe('Qual 1 · Red 1 · Team 5098');
    expect(recordTitle(record(pitForm()))).toBe('Pit · Team 5098');
  });
});
