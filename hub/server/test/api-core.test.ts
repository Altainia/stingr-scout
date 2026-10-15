import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { makeApp, setupEvent } from './helpers';

const device = { id: 'dev-1', name: 'Tablet 1' };

describe('basics', () => {
  it('answers ping', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/api/ping' })).json()).toEqual({ hub: 'stingr-scout', appBuild: 'test-build' });
  });
  it('explains when the web apps are not built', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/' })).body).toContain('not been built');
    expect((await app.inject({ url: '/hub/' })).body).toContain('not been built');
    const hub = await app.inject({ url: '/hub' });
    expect(hub.statusCode).toBe(302);
    expect(hub.headers.location).toBe('/hub/');
  });
});

describe('events', () => {
  it('creates events and selects the first as current', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027OHCL', name: 'Buckeye' } });
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027mokc', name: 'Heartland' } });
    expect(res.json()).toEqual({
      events: [{ key: '2027mokc', name: 'Heartland' }, { key: '2027ohcl', name: 'Buckeye' }],
      current: { key: '2027ohcl', name: 'Buckeye' },
    });
    const switched = await app.inject({ method: 'PUT', url: '/api/events/current', payload: { key: '2027mokc' } });
    expect(switched.json().current.key).toBe('2027mokc');
  });
  it('rejects bad keys and unknown events', async () => {
    const app = await makeApp();
    expect((await app.inject({ method: 'POST', url: '/api/events', payload: { key: 'Bad Key!' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/events/current', payload: { key: 'nope' } })).statusCode).toBe(404);
  });
  it('needs a current event for event data', async () => {
    const res = await (await makeApp()).inject({ url: '/api/schedule' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/No current event/);
  });
});

describe('teams and settings', () => {
  it('adds and removes teams', async () => {
    const app = await makeApp();
    await setupEvent(app);
    expect((await app.inject({ method: 'POST', url: '/api/teams', payload: { team: 'frc5098' } })).json()).toEqual([5098]);
    expect((await app.inject({ method: 'POST', url: '/api/teams', payload: { team: 0 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/teams/5098' })).json()).toEqual([]);
  });
  it('stores the TBA key without revealing it', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/api/settings' })).json()).toEqual({ tbaKeySet: false });
    expect((await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: ' abc ' } })).json()).toEqual({ tbaKeySet: true });
    expect((await app.inject({ url: '/api/settings' })).body).not.toContain('abc');
  });
});

describe('forms', () => {
  it('saves drafts, reports problems and publishes', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/api/forms/match/draft' })).json()).toEqual({ draft: null, isDraft: false });
    const bad = await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: { ...matchForm(), sections: [] } });
    expect(bad.json()).toEqual({ errors: ['Form has no questions'], warnings: [] });
    expect((await app.inject({ method: 'POST', url: '/api/forms/match/publish' })).statusCode).toBe(422);
    await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: matchForm() });
    const pub = await app.inject({ method: 'POST', url: '/api/forms/match/publish' });
    expect(pub.json()).toEqual({ ok: true, form: matchForm(1), warnings: [] });
    expect((await app.inject({ url: '/api/forms' })).json()).toEqual([matchForm(1)]);
  });
  it('rejects malformed forms and unknown kinds', async () => {
    const app = await makeApp();
    expect((await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: { sections: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/forms/robot/draft' })).statusCode).toBe(404);
    const noOptions = { sections: [{ id: 'a', title: 'A', questions: [{ type: 'choice', key: 'c', label: 'C', required: false }] }], assets: {} };
    const res = await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: noOptions });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('The form is malformed');
  });
});

describe('sync over HTTP', () => {
  it('re-sending the same records is harmless', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const recs = [record(matchForm()), record(matchForm(), { slot: 'blue2' })];
    const first = await app.inject({ method: 'POST', url: '/api/sync', payload: { device, records: recs } });
    expect(first.json().acked).toHaveLength(2);
    const again = await app.inject({ method: 'POST', url: '/api/sync', payload: { device, records: recs } });
    expect(again.json().acked).toEqual(recs.map(r => ({ id: r.id, revision: 1 })));
    expect((await app.inject({ url: '/api/records?kind=match' })).json()).toHaveLength(2);
    expect((await app.inject({ url: `/api/records/${recs[0].id}/history` })).json()).toHaveLength(1);
  });
  it('rejects a malformed request', async () => {
    const res = await (await makeApp()).inject({ method: 'POST', url: '/api/sync', payload: { device } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Sync request needs a records list' });
  });
});

describe('photos', () => {
  it('stores and serves photos', async () => {
    const app = await makeApp();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    const put = await app.inject({ method: 'PUT', url: '/api/photos/ph-1?recordId=rec-9', headers: { 'content-type': 'image/jpeg' }, payload: bytes });
    expect(put.statusCode).toBe(204);
    const get = await app.inject({ url: '/api/photos/ph-1' });
    expect(get.headers['content-type']).toBe('image/jpeg');
    expect(get.rawPayload).toEqual(bytes);
  });
  it('rejects other content and unknown photos', async () => {
    const app = await makeApp();
    const put = await app.inject({ method: 'PUT', url: '/api/photos/ph-1?recordId=r', headers: { 'content-type': 'text/plain' }, payload: 'hi' });
    expect(put.statusCode).toBe(415);
    expect((await app.inject({ url: '/api/photos/nope' })).statusCode).toBe(404);
  });
});

describe('pit forms', () => {
  it('publishes pit forms independently', async () => {
    const app = await makeApp();
    await setupEvent(app, [pitForm()]);
    expect((await app.inject({ url: '/api/forms' })).json().map((f: { kind: string }) => f.kind)).toEqual(['pit']);
  });
});
