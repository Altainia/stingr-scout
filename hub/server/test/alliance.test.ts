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
