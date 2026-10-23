import { describe, expect, it } from 'vitest';
import { makeApp, setupEvent } from './helpers';

async function hub() {
  const app = await makeApp();
  await setupEvent(app);
  await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,5098,254,118,148,971,1323\n2,5098,148,971,254,118,1323' });
  const get = async () => (await app.inject({ url: '/api/alliance' })).json();
  const put = (match: string, alliance: string, item: string, value: number | null) =>
    app.inject({ method: 'PUT', url: `/api/alliance/${match}/${alliance}/${item}`, payload: { value } });
  return { app, get, put };
}

describe('alliance results', () => {
  it('lists every scheduled match with both alliances and their teams, starting blank', async () => {
    const { get } = await hub();
    const { matches, fields } = await get();
    expect(fields).toEqual([]);
    expect(matches[0]).toEqual({ matchKey: 'qm1', red: { teams: [5098, 254, 118], values: {} }, blue: { teams: [148, 971, 1323], values: {} } });
  });

  it('saves a typed score or field value, and clears it', async () => {
    const { get, put, app } = await hub();
    await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'hopper', label: 'Balls in hopper' }] });
    expect((await put('qm1', 'red', 'score', 87)).statusCode).toBe(200);
    await put('qm1', 'red', 'hopper', 31);
    expect((await get()).matches[0].red.values).toEqual({ score: { value: 87, source: 'manual' }, hopper: { value: 31, source: 'manual' } });
    await put('qm1', 'red', 'hopper', null);
    expect((await get()).matches[0].red.values).toEqual({ score: { value: 87, source: 'manual' } });
  });

  it('refuses a value for an unknown field, alliance or a non-number', async () => {
    const { put } = await hub();
    expect((await put('qm1', 'red', 'nope', 3)).statusCode).toBe(400);
    expect((await put('qm1', 'green', 'score', 3)).statusCode).toBe(400);
    expect((await put('qm1', 'red', 'score', 'lots' as unknown as number)).statusCode).toBe(400);
  });

  it('defines alliance fields with checked keys; removing one removes its values', async () => {
    const { app, put, get } = await hub();
    const bad = await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'score', label: 'Score' }] });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'hopper', label: 'Balls in hopper', tba: 'hubFuelCount' }] });
    expect(ok.json()).toEqual([{ key: 'hopper', label: 'Balls in hopper', tba: 'hubFuelCount' }]);
    await put('qm1', 'red', 'hopper', 5);
    await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [] });
    expect((await get()).matches[0].red.values).toEqual({});
  });

  it('estimates team shares from alliance scores once teams have enough results', async () => {
    const { get, put } = await hub();
    await put('qm1', 'red', 'score', 60);
    await put('qm1', 'blue', 'score', 30);
    const { shares } = await get();
    expect(shares.score[5098]).toBeNull(); // one result so far
  });

  it("removes an event's results with the event, and the fields with a new season", async () => {
    const { app, put } = await hub();
    await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'hopper', label: 'Balls in hopper' }] });
    await put('qm1', 'red', 'score', 87);
    await app.inject({ method: 'POST', url: '/api/events/2027test/delete', payload: { confirm: '2027test' } });
    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027test', name: 'Again' } });
    expect((await app.inject({ url: '/api/alliance' })).json()).toMatchObject({ matches: [], fields: [{ key: 'hopper' }] }); // fields stay
    await app.inject({ method: 'POST', url: '/api/season/new', payload: { confirm: 'NEW SEASON' } });
    expect((await app.inject({ method: 'GET', url: '/api/alliance-fields' })).json()).toEqual([]);
  });
});

describe('alliance exports', () => {
  it('exports one row per match and alliance, and adds estimated shares to the teams export', async () => {
    const { app, put } = await hub();
    await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'hopper', label: 'Balls in hopper' }] });
    await put('qm1', 'red', 'score', 87);
    await put('qm1', 'red', 'hopper', 31);
    const csv = (await app.inject({ url: '/api/export/alliance.csv' })).body.replace(/^\uFEFF/, '').split('\r\n');
    expect(csv[0]).toBe('event,match,alliance,teams,score,hopper,source');
    expect(csv[1]).toBe('2027test,qm1,red,5098;254;118,87,31,manual');
    expect(csv[2]).toBe('2027test,qm1,blue,148;971;1323,,,');
    const teams = (await app.inject({ url: '/api/export/teams.csv' })).body.replace(/^\uFEFF/, '').split('\r\n')[0];
    expect(teams.endsWith(',share_score,share_hopper')).toBe(true);
  });
});

describe('fetching alliance results from The Blue Alliance', () => {
  const tbaMatch = (key: string, red: number, blue: number, rb: Record<string, unknown> | null, bb: Record<string, unknown> | null) => ({
    key: `2027test_${key}`,
    alliances: { red: { score: red, team_keys: ['frc5098', 'frc254', 'frc118'] }, blue: { score: blue, team_keys: ['frc148', 'frc971', 'frc1323'] } },
    score_breakdown: rb && bb ? { red: rb, blue: bb } : null,
  });
  const MATCHES = [
    tbaMatch('qm1', 87, 64, { hubFuelCount: 31, endgame: { climbed: true }, totalPoints: 87 }, { hubFuelCount: 20, endgame: { climbed: false }, totalPoints: 64 }),
    tbaMatch('qm2', -1, -1, null, null), // not played yet
  ];
  const fakeTba = (matches: unknown) => (async (input: string | URL | Request) => {
    const path = String(input).replace('https://www.thebluealliance.com/api/v3', '');
    if (path === '/event/2027test/matches') return new Response(JSON.stringify(matches), { status: 200 });
    return new Response('null', { status: 404 });
  }) as typeof fetch;

  async function tbaHub(matches: unknown = MATCHES) {
    const app = await makeApp({ fetch: fakeTba(matches) });
    await setupEvent(app);
    await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,5098,254,118,148,971,1323\n2,5098,148,971,254,118,1323' });
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'k' } });
    return app;
  }

  it('fills scores and linked fields of played matches, and lists the items TBA reports', async () => {
    const app = await tbaHub();
    await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'hopper', label: 'Balls in hopper', tba: 'hubFuelCount' }, { key: 'climbed', label: 'Climbed', tba: 'endgame.climbed' }] });
    const res = await app.inject({ method: 'POST', url: '/api/alliance/tba' });
    expect(res.json()).toEqual({ played: 1, filled: 6 });
    const { matches, tbaItems } = (await app.inject({ url: '/api/alliance' })).json();
    expect(matches[0].red.values).toEqual({ score: { value: 87, source: 'tba' }, hopper: { value: 31, source: 'tba' }, climbed: { value: 1, source: 'tba' } });
    expect(matches[0].blue.values.climbed).toEqual({ value: 0, source: 'tba' });
    expect(matches[1].red.values).toEqual({}); // not played
    expect(tbaItems).toEqual(['endgame.climbed', 'hubFuelCount', 'totalPoints']);
  });

  it('never overwrites a typed value, but updates its own', async () => {
    const app = await tbaHub();
    await app.inject({ method: 'PUT', url: '/api/alliance/qm1/red/score', payload: { value: 90 } });
    await app.inject({ method: 'POST', url: '/api/alliance/tba' });
    const { matches } = (await app.inject({ url: '/api/alliance' })).json();
    expect(matches[0].red.values.score).toEqual({ value: 90, source: 'manual' });
    expect(matches[0].blue.values.score).toEqual({ value: 64, source: 'tba' });
  });

  it('explains when The Blue Alliance cannot be reached or no key is set', async () => {
    const offline = await makeApp({ fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    await setupEvent(offline);
    expect((await offline.inject({ method: 'POST', url: '/api/alliance/tba' })).json().error).toBe('Enter a TBA API key in Settings first');
    await offline.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'k' } });
    const res = await offline.inject({ method: 'POST', url: '/api/alliance/tba' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toContain("Couldn't reach The Blue Alliance");
  });
});

describe('estimated shares in summaries', () => {
  it('sends the score share with the Teams summaries, and every item with a team', async () => {
    const { app, put } = await hub();
    await app.inject({ method: 'PUT', url: '/api/alliance-fields', payload: [{ key: 'hopper', label: 'Balls in hopper' }] });
    await put('qm1', 'red', 'score', 60);
    const all = (await app.inject({ url: '/api/summaries' })).json();
    expect(all.scoreShares).toHaveProperty('5098');
    const team = (await app.inject({ url: '/api/summaries/5098' })).json();
    expect(team.allianceShares).toEqual([
      { item: 'score', label: 'Score', value: null, results: 1 },
      { item: 'hopper', label: 'Balls in hopper', value: null, results: 0 },
    ]);
  });
});
