import { describe, expect, it } from 'vitest';
import { checkScheduleMatch, parseScheduleCsv } from '../src/scheduleIo';
import { fetchTbaEvent, TBA_BASE } from '../src/tba';
import { makeApp, setupEvent } from './helpers';

describe('parseScheduleCsv', () => {
  it('reads a header in any order with BOM, CRLF, blank lines and frc prefixes', () => {
    const csv = '﻿Red1,red2,red3,Blue1,blue2,blue3,Match\r\n1,2,3,4,5,6,1\r\n\r\nfrc7, 8 ,9,10,11,12,qm10\r\n';
    expect(parseScheduleCsv(csv)).toEqual({
      matches: [
        { matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] },
        { matchKey: 'qm10', red: [7, 8, 9], blue: [10, 11, 12] },
      ],
      errors: [],
    });
  });
  it('reads rows without a header in standard order', () => {
    expect(parseScheduleCsv('3,1,2,3,4,5,6').matches).toEqual([{ matchKey: 'qm3', red: [1, 2, 3], blue: [4, 5, 6] }]);
  });
  it('reports problems with line numbers', () => {
    const csv = 'match,red1,red2,red3,blue1,blue2,blue3\nx,1,2,3,4,5,6\n2,1,2,abc,4,5,6\n4,1,2,3,4,5,6\n4,1,2,3,4,5,6';
    expect(parseScheduleCsv(csv).errors).toEqual([
      'Line 2: "x" is not a match number or key',
      'Line 3: "abc" is not a team number',
      'Line 5: match qm4 appears twice',
    ]);
  });
  it('reports missing columns and empty files', () => {
    expect(parseScheduleCsv('match,red1,red2\n1,2,3').errors).toEqual(['Missing column(s): red3, blue1, blue2, blue3']);
    expect(parseScheduleCsv('\n\n').errors).toEqual(['The file is empty']);
  });
});

describe('checkScheduleMatch', () => {
  it('normalizes valid matches and rejects bad ones', () => {
    expect(checkScheduleMatch({ matchKey: '5', red: [1, 2, 3], blue: [4, 5, 0] })).toEqual({ matchKey: 'qm5', red: [1, 2, 3], blue: [4, 5, 0] });
    expect(checkScheduleMatch({ matchKey: 'nope', red: [1, 2, 3], blue: [4, 5, 6] })).toBe('"nope" is not a match key');
    expect(checkScheduleMatch({ matchKey: 'qm1', red: [1, 2], blue: [4, 5, 6] })).toBe('Match qm1 needs three red and three blue team numbers');
  });
});

const alliance = (r: number[], b: number[]) => ({
  red: { team_keys: r.map(t => `frc${t}`) },
  blue: { team_keys: b.map(t => `frc${t}`) },
});

const TBA_DATA: Record<string, unknown> = {
  '/event/2027test/simple': { key: '2027test', name: 'Test Regional' },
  '/event/2027test/matches/simple': [
    { key: '2027test_sf1m1', alliances: alliance([1, 2, 3], [4, 5, 6]) },
    { key: '2027test_qm10', alliances: alliance([7, 8, 9], [10, 11, 12]) },
    { key: '2027test_qm2', alliances: alliance([1, 2, 3], [4, 5, 6]) },
  ],
  '/event/2027test/teams/keys': ['frc12', 'frc1', 'frc5098'],
};

function fakeFetch(data: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace(TBA_BASE, '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers['X-TBA-Auth-Key'] !== 'key123') return new Response('{}', { status: 401 });
    if (!(path in data)) return new Response('null', { status: 404 });
    return new Response(JSON.stringify(data[path]), { status: 200 });
  }) as typeof fetch;
}

describe('fetchTbaEvent', () => {
  it('maps matches and teams in order', async () => {
    expect(await fetchTbaEvent('2027test', 'key123', fakeFetch(TBA_DATA))).toEqual({
      name: 'Test Regional',
      matches: [
        { matchKey: 'qm2', red: [1, 2, 3], blue: [4, 5, 6] },
        { matchKey: 'qm10', red: [7, 8, 9], blue: [10, 11, 12] },
        { matchKey: 'sf1m1', red: [1, 2, 3], blue: [4, 5, 6] },
      ],
      teams: [1, 12, 5098],
    });
  });
  it('explains failures', async () => {
    await expect(fetchTbaEvent('2027test', 'wrong', fakeFetch(TBA_DATA))).rejects.toThrow('The Blue Alliance rejected the API key');
    await expect(fetchTbaEvent('2027none', 'key123', fakeFetch(TBA_DATA))).rejects.toThrow('The Blue Alliance has no event "2027none"');
    const offline = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await expect(fetchTbaEvent('2027test', 'key123', offline)).rejects.toThrow("Couldn't reach The Blue Alliance");
  });
});

describe('schedule import routes', () => {
  it('imports CSV and reports CSV errors', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const ok = await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,1,2,3,4,5,6\n2,6,5,4,3,2,1' });
    expect(ok.json()).toEqual({ matches: 2 });
    const bad = await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: 'x,1,2,3,4,5,6' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().errors).toHaveLength(1);
    expect((await app.inject({ url: '/api/schedule' })).json()).toHaveLength(2);
  });

  it('accepts a manually edited schedule as JSON', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const res = await app.inject({ method: 'PUT', url: '/api/schedule', payload: [{ matchKey: '1', red: [1, 2, 3], blue: [4, 5, 6] }] });
    expect(res.json()).toEqual([{ matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] }]);
    const bad = await app.inject({ method: 'PUT', url: '/api/schedule', payload: [{ matchKey: 'qm1', red: [1], blue: [] }] });
    expect(bad.statusCode).toBe(400);
  });

  it('fetches from TBA once a key is set', async () => {
    const app = await makeApp({ fetch: fakeFetch(TBA_DATA) });
    await setupEvent(app);
    expect((await app.inject({ method: 'POST', url: '/api/schedule/tba' })).statusCode).toBe(400);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'key123' } });
    const res = await app.inject({ method: 'POST', url: '/api/schedule/tba' });
    expect(res.json()).toEqual({ matches: 3, teams: 3, scheduleReplaced: true });
    expect((await app.inject({ url: '/api/events' })).json().current).toEqual({ key: '2027test', name: 'Test Regional', redSide: 'left' });
    expect((await app.inject({ url: '/api/teams' })).json()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5098]);
  });

  it('keeps the existing schedule when TBA has no matches yet', async () => {
    const empty = { ...TBA_DATA, '/event/2027test/matches/simple': [] };
    const app = await makeApp({ fetch: fakeFetch(empty) });
    await setupEvent(app);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'key123' } });
    await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,1,2,3,4,5,6' });
    const res = await app.inject({ method: 'POST', url: '/api/schedule/tba' });
    expect(res.json()).toEqual({ matches: 0, teams: 3, scheduleReplaced: false });
    expect((await app.inject({ url: '/api/schedule' })).json()).toHaveLength(1);
  });

  it('reports TBA failures as 502', async () => {
    const app = await makeApp({ fetch: fakeFetch(TBA_DATA) });
    await setupEvent(app);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'wrong' } });
    const res = await app.inject({ method: 'POST', url: '/api/schedule/tba' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('The Blue Alliance rejected the API key');
  });
});
