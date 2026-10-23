import { markMissed, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { matchesCsv, pitCsv, teamsCsv } from '../src/export';
import { buildTeamSummaries } from '../src/summaries';
import { makeApp, setupEvent } from './helpers';

describe('matchesCsv', () => {
  it('uses the union of question columns across form versions, in match order', () => {
    const v1 = matchForm(1);
    const v2 = matchForm(2);
    v2.sections[0].questions.push({ key: 'teleop_algae', label: 'Algae', type: 'counter', required: false, min: 0, step: 1, default: 0, points: 2 });
    v2.sections[2].questions = v2.sections[2].questions.filter(q => q.key !== 'zones');
    const a = setAnswer(setAnswer(record(v1, { id: 'a', matchKey: 'qm10', slot: 'blue1', team: 254 }), 'zones', ['near', 'far']), 'climb', 'deep');
    const b = markMissed(setAnswer(record(v2, { id: 'b', matchKey: 'qm2', slot: 'red3', team: 5098 }), 'teleop_algae', 3), 'climb');

    const lines = matchesCsv('2027test', [v1, v2], [a, b]).split('\r\n');
    expect(lines[0]).toBe('event,match,slot,team,scout,device,no_show,est_points,missed,revision,updated_at,auto_leave,auto_coral,start_pos,teleop_algae,climb,climb_time,defense,comments,zones');
    expect(lines[1]).toBe('2027test,qm2,red3,5098,Ada,dev-1,false,6,climb,1,2027-03-01T10:00:00.000Z,false,0,,3,,,,,');
    expect(lines[2]).toBe('2027test,qm10,blue1,254,Ada,dev-1,false,12,,1,2027-03-01T10:00:00.000Z,false,0,,,deep,,,,near;far');
    expect(lines[3]).toBe('');
  });

  it('escapes awkward text and blocks spreadsheet formulas', () => {
    const f = matchForm();
    const c = setAnswer(setAnswer(record(f, { id: 'c' }), 'comments', 'Fast, "great"\ndriver'), 'start_pos', [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
    const d = setAnswer(record(f, { id: 'd', matchKey: 'qm3' }), 'comments', '=HYPERLINK("x")');
    const e = setAnswer(record(f, { id: 'e', matchKey: 'qm4' }), 'comments', '-slow');
    const csv = matchesCsv('2027test', [f], [c, d, e]);
    expect(csv).toContain('"Fast, ""great""\ndriver"');
    expect(csv).toContain('"0.1,0.2;0.3,0.4"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",'-slow\r\n");
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(4);
  });

  it('blocks formulas in every text column, not just answers', () => {
    const f = matchForm();
    const r = setAnswer(record(f, { id: 'z', scout: '=HYPERLINK("x")' }), 'zones', ['=bad']);
    const csv = matchesCsv('2027test', [f], [r]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",'=bad,");
    expect(csv).not.toMatch(/(^|,)=/m);
  });
});

describe('pitCsv', () => {
  it('writes one row per pit record', () => {
    const p = setAnswer(record(pitForm(), { id: 'p', team: 254, photoIds: ['x', 'y'] }), 'drivetrain', 'swerve');
    expect(pitCsv('2027test', [pitForm()], [p])).toBe(
      'event,team,scout,device,no_show,photos,missed,revision,updated_at,drivetrain,weight_lb\r\n'
      + '2027test,254,Ada,dev-1,false,2,,1,2027-03-01T10:00:00.000Z,swerve,\r\n',
    );
  });
});

describe('teamsCsv', () => {
  it('flattens team summaries', () => {
    const f = matchForm();
    const r = setAnswer(setAnswer(setAnswer(record(f), 'auto_coral', 2), 'auto_leave', true), 'climb', 'deep');
    const lines = teamsCsv(buildTeamSummaries([5098], f, [r], []), f).split('\r\n');
    expect(lines[0]).toBe('team,match_records,no_shows,no_show_pct,est_points,pit,est_auto,est_endgame,est_notes,auto_leave_pct,auto_coral_avg,auto_coral_max,climb_none_pct,climb_shallow_pct,climb_deep_pct,climb_time_avg,climb_time_max,defense_avg,defense_max,zones_near_pct,zones_far_pct');
    expect(lines[1]).toBe('5098,1,0,0,23,none,11,12,,100,2,2,0,0,100,,,,,,');
  });
});

describe('export route', () => {
  it('downloads CSV files for the current event', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const res = await app.inject({ url: '/api/export/matches.csv' });
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="2027test-matches.csv"');
    expect(res.body.startsWith('\uFEFFevent,match,slot')).toBe(true);
    expect((await app.inject({ url: '/api/export/teams.csv' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/export/pit.csv' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/export/secrets.csv' })).statusCode).toBe(404);
  });
});

describe('dimensions in exports', () => {
  it('gives each measurement its own column, in inches', () => {
    const f = pitForm();
    f.sections[0].questions.push({ key: 'frame', label: 'Frame size', type: 'dimensions', required: false, parts: ['length', 'height'] });
    const p = setAnswer(record(f, { team: 5098 }), 'frame', { length: 30.5, height: 40 });
    const lines = pitCsv('2027test', [f], [p]).split('\r\n');
    expect(lines[0]).toBe('event,team,scout,device,no_show,photos,missed,revision,updated_at,drivetrain,weight_lb,frame_length_in,frame_height_in');
    expect(lines[1].endsWith(',,,30.5,40')).toBe(true);
  });
});

describe('dimensions in team summaries', () => {
  it("gives each team's measurements from its newest pit record", () => {
    const f = pitForm();
    f.sections[0].questions.push({ key: 'frame', label: 'Frame size', type: 'dimensions', required: false, parts: ['length', 'width'] });
    const old = setAnswer(record(f, { team: 5098, updatedAt: '2027-03-01T09:00:00.000Z' }), 'frame', { length: 20, width: 20 });
    const now = setAnswer(record(f, { team: 5098, updatedAt: '2027-03-01T11:00:00.000Z' }), 'frame', { length: 30, width: 28 });
    const [s] = buildTeamSummaries([5098], matchForm(), [], [now, old], f);
    expect(s.pitStats.frame).toEqual({ kind: 'size', n: 1, parts: { length: 30, width: 28 } });
  });
});
