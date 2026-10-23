import { encodeRecordQr, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, record } from '../../../shared/test/fixtures';
import { makeApp, setupEvent } from './helpers';

const device = { id: 'dev-1', name: 'Tablet 1' };

describe('coverage and summaries', () => {
  it("includes the event's averages with a team, for comparing", async () => {
    const app = await makeApp();
    await setupEvent(app);
    const f = matchForm();
    const mine = setAnswer(setAnswer(record(f, { team: 5098, matchKey: 'qm1' }), 'auto_coral', 2), 'defense', 4);
    const theirs = setAnswer(setAnswer(record(f, { team: 254, matchKey: 'qm1', slot: 'blue1' }), 'auto_coral', 6), 'defense', 2);
    await app.inject({ method: 'POST', url: '/api/sync', payload: { device, records: [mine, theirs] } });
    const { eventAverages } = (await app.inject({ url: '/api/summaries/5098' })).json();
    expect(eventAverages.questions).toMatchObject({ auto_coral: 4, defense: 3 }); // across every team at the event
    expect(eventAverages.points.total).toBe(16); // (2 + 6) / 2 coral × 4 points each
    expect(eventAverages.points.bySection.auto).toBe(16);
  });

  it('serves coverage and summaries for the current event', async () => {
    const app = await makeApp();
    await setupEvent(app);
    await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,5098,2,3,4,5,6' });
    const r = setAnswer(record(matchForm()), 'climb', 'deep');
    await app.inject({ method: 'POST', url: '/api/sync', payload: { device, records: [r] } });

    const coverage = (await app.inject({ url: '/api/coverage' })).json();
    expect(coverage[0].cells.red1).toEqual({ team: 5098, status: 'ok', recordIds: [r.id] });

    const all = (await app.inject({ url: '/api/summaries' })).json();
    expect(all.form.version).toBe(1);
    expect(all.summaries.find((s: { team: number }) => s.team === 5098).estPoints).toBe(12);

    const team = (await app.inject({ url: '/api/summaries/5098' })).json();
    expect(team.summary.team).toBe(5098);
    expect(team.matchRecords).toEqual([r]);
    expect(team.pitForm.kind).toBe('pit');
  });
});

describe('QR intake', () => {
  it('stores scanned records once', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const r = setAnswer(record(matchForm()), 'climb', 'deep');
    const [code] = await encodeRecordQr(matchForm(), r);
    const first = await app.inject({ method: 'POST', url: '/api/qr', payload: { text: code } });
    expect(first.json()).toEqual({
      status: 'stored',
      record: { id: r.id, revision: 1, kind: 'match', team: 5098, matchKey: 'qm1', slot: 'red1', scout: 'Ada' },
    });
    expect((await app.inject({ method: 'POST', url: '/api/qr', payload: { text: code } })).json().status).toBe('duplicate');
    expect((await app.inject({ url: '/api/records?kind=match' })).json()).toEqual([r]);
  });

  it('collects multi-part codes', async () => {
    const app = await makeApp();
    await setupEvent(app);
    let seed = 7;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const text = Array.from({ length: 4000 }, () => 'abcdefghijklmnopqrstuvwxyz '[Math.floor(rand() * 27)]).join('');
    const chunks = await encodeRecordQr(matchForm(), setAnswer(record(matchForm()), 'comments', text));
    expect(chunks.length).toBeGreaterThan(1);
    const first = (await app.inject({ method: 'POST', url: '/api/qr', payload: { text: chunks[0] } })).json();
    expect(first).toMatchObject({ status: 'partial', have: 1, total: chunks.length });
    let last;
    for (const c of chunks.slice(1)) last = (await app.inject({ method: 'POST', url: '/api/qr', payload: { text: c } })).json();
    expect(last.status).toBe('stored');
  });

  it('rejects text that is not ours', async () => {
    const res = await (await makeApp()).inject({ method: 'POST', url: '/api/qr', payload: { text: 'hello' } });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ status: 'invalid', reason: 'Not a Stingr Scout QR code' });
  });
});
