import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { openDb } from '../src/db';
import { deleteEvent, eventCounts, seasonCounts, startNewSeason } from '../src/store/clear';
import { listDevices, touchDevice } from '../src/store/devices';
import { currentEvent, listEvents, setCurrentEvent, upsertEvent } from '../src/store/events';
import { getDraft, listForms, publishDraft, saveDraft } from '../src/store/forms';
import { hubIdentity } from '../src/store/identity';
import { getPhoto, putPhoto } from '../src/store/photos';
import { currentRecords, insertRecord } from '../src/store/records';
import { listSchedule, listTeams, replaceSchedule } from '../src/store/schedule';
import { getSetting } from '../src/store/settings';
import { makeApp, setupEvent } from './helpers';

const NOW = '2027-03-01T12:00:00.000Z';

function twoEvents() {
  const db = openDb(':memory:');
  for (const key of ['2027aaa', '2027bbb']) {
    upsertEvent(db, { key, name: key });
    replaceSchedule(db, key, [{ matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] }]);
  }
  setCurrentEvent(db, '2027aaa');
  for (const f of [matchForm(), pitForm()]) {
    saveDraft(db, f, NOW);
    publishDraft(db, f.kind, NOW);
  }
  const a = record(matchForm(), { eventKey: '2027aaa', photoIds: ['p1'] });
  insertRecord(db, a, 'usb', NOW);
  insertRecord(db, { ...a, revision: 2 }, 'usb', NOW);
  insertRecord(db, record(matchForm(), { eventKey: '2027bbb' }), 'usb', NOW);
  putPhoto(db, 'p1', a.id, 'image/png', new Uint8Array([1]), NOW);
  touchDevice(db, { id: 'dev-1', name: 'Tablet 1' }, NOW);
  return db;
}

describe('deleting an event', () => {
  it('counts what would go, then removes the event with its schedule, teams, records and photos', () => {
    const db = twoEvents();
    expect(eventCounts(db, '2027aaa')).toEqual({ matches: 1, teams: 6, records: 1, photos: 1, allianceResults: 0 });
    expect(eventCounts(db, '2027zzz')).toBeNull();
    expect(deleteEvent(db, '2027aaa')).toEqual({ matches: 1, teams: 6, records: 1, photos: 1, allianceResults: 0 });
    expect(listEvents(db).map(e => e.key)).toEqual(['2027bbb']);
    expect(listSchedule(db, '2027aaa')).toEqual([]);
    expect(listTeams(db, '2027aaa')).toEqual([]);
    expect(currentRecords(db, '2027aaa', 'match')).toEqual([]);
    expect(getPhoto(db, 'p1')).toBeUndefined();
    expect(currentRecords(db, '2027bbb', 'match')).toHaveLength(1); // the other event is untouched
    expect(currentEvent(db)).toBeNull(); // it was the current event
    expect(listForms(db)).toHaveLength(2); // forms stay
  });

  it('refuses an unknown event', () => {
    expect(() => deleteEvent(twoEvents(), '2027zzz')).toThrow('Unknown event "2027zzz"');
  });
});

describe('starting a new season', () => {
  it('removes events, records, photos, forms, drafts and tablets; keeps settings; numbering continues', () => {
    const db = twoEvents();
    saveDraft(db, matchForm(), NOW);
    const before = hubIdentity(db);
    expect(seasonCounts(db)).toEqual({ events: 2, records: 2, photos: 1, forms: 2, drafts: 1, devices: 1, allianceResults: 0, allianceFields: 0 });
    expect(startNewSeason(db)).toEqual({ events: 2, records: 2, photos: 1, forms: 2, drafts: 1, devices: 1, allianceResults: 0, allianceFields: 0 });
    expect(seasonCounts(db)).toEqual({ events: 0, records: 0, photos: 0, forms: 0, drafts: 0, devices: 0, allianceResults: 0, allianceFields: 0 });
    expect(getDraft(db, 'match')).toBeNull();
    expect(listDevices(db)).toEqual([]);
    expect(currentEvent(db)).toBeNull();
    expect(getSetting(db, 'form_version_floor:match')).toBe('1');
    expect(getSetting(db, 'form_version_floor:pit')).toBe('1');
    const after = hubIdentity(db);
    expect(after.hubId).toBe(before.hubId);
    expect(after.seasonId).not.toBe(before.seasonId);
  });
});

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
async function fileApp() {
  const dir = mkdtempSync(join(tmpdir(), 'stingr-clear-'));
  dirs.push(dir);
  const dbPath = join(dir, 'stingr.db');
  return { dir, app: await makeApp({ db: openDb(dbPath), dbPath }) };
}

describe('clearing routes', () => {
  it('previews, refuses without the typed confirmation, then deletes an event after saving a backup', async () => {
    const { dir, app } = await fileApp();
    await setupEvent(app);
    expect((await app.inject({ url: '/api/events/2027test/clear' })).json()).toEqual({ matches: 0, teams: 0, records: 0, photos: 0, allianceResults: 0 });
    const wrong = await app.inject({ method: 'POST', url: '/api/events/2027test/delete', payload: { confirm: '2027tes' } });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('Type the event key to confirm');
    const res = await app.inject({ method: 'POST', url: '/api/events/2027test/delete', payload: { confirm: '2027test' } });
    expect(res.json()).toEqual({ ok: true, backup: 'stingr-2027-03-01T12-00-00-000Z.db', removed: { matches: 0, teams: 0, records: 0, photos: 0, allianceResults: 0 } });
    expect(existsSync(join(dir, 'backups', 'stingr-2027-03-01T12-00-00-000Z.db'))).toBe(true);
    expect((await app.inject({ url: '/api/events' })).json().events).toEqual([]);
    expect((await app.inject({ url: '/api/events/2027test/clear' })).statusCode).toBe(404);
  });

  it('starts a new season only with NEW SEASON typed', async () => {
    const { app } = await fileApp();
    await setupEvent(app);
    expect((await app.inject({ url: '/api/season/clear' })).json()).toMatchObject({ events: 1, forms: 2 });
    expect((await app.inject({ method: 'POST', url: '/api/season/new', payload: { confirm: 'new season' } })).statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/api/season/new', payload: { confirm: 'NEW SEASON' } });
    expect(res.json()).toMatchObject({ ok: true, removed: { events: 1, forms: 2 } });
    expect((await app.inject({ url: '/api/forms' })).json()).toEqual([]);
  });

  it('clears without a backup when there is no database file', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const res = await app.inject({ method: 'POST', url: '/api/events/2027test/delete', payload: { confirm: '2027test' } });
    expect(res.json()).toMatchObject({ ok: true, backup: null });
  });

  it('does not clear anything when the backup cannot be written', async () => {
    const { dir, app } = await fileApp();
    await setupEvent(app);
    writeFileSync(join(dir, 'backups'), 'not a folder'); // the backups folder can't be created
    const res = await app.inject({ method: 'POST', url: '/api/season/new', payload: { confirm: 'NEW SEASON' } });
    expect(res.statusCode).toBe(500);
    expect((await app.inject({ url: '/api/events' })).json().events).toHaveLength(1);
  });
});
