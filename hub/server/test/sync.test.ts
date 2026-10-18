import { reviseRecord, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { openDb } from '../src/db';
import { listDevices } from '../src/store/devices';
import { setCurrentEvent, upsertEvent } from '../src/store/events';
import { publishDraft, saveDraft } from '../src/store/forms';
import { getPhoto, putPhoto } from '../src/store/photos';
import { deleteEvent } from '../src/store/clear';
import { currentRecords, recordHistory } from '../src/store/records';
import { replaceSchedule } from '../src/store/schedule';
import { handleSync, parseSyncRequest } from '../src/sync';

const NOW = '2027-03-01T12:00:00.000Z';
const LATER = '2027-03-01T12:10:00.000Z';
const device = { id: 'dev-1', name: 'Tablet 1' };

function setup() {
  const db = openDb(':memory:');
  upsertEvent(db, { key: '2027test', name: 'Test' });
  setCurrentEvent(db, '2027test');
  saveDraft(db, matchForm(), NOW);
  publishDraft(db, 'match', NOW);
  saveDraft(db, pitForm(), NOW);
  publishDraft(db, 'pit', NOW);
  replaceSchedule(db, '2027test', [{ matchKey: 'qm1', red: [5098, 2, 3], blue: [4, 5, 6] }]);
  return db;
}

describe('handleSync', () => {
  it('acks new records and returns the hub config', () => {
    const db = setup();
    const r = record(matchForm());
    const res = handleSync(db, { device, records: [r] }, 'build-1', NOW);
    expect(res.acked).toEqual([{ id: r.id, revision: 1 }]);
    expect(res.rejected).toEqual([]);
    expect(res.config).toMatchObject({ event: { key: '2027test', name: 'Test' }, appBuild: 'build-1', teams: [2, 3, 4, 5, 6, 5098] });
    expect(res.config.schedule).toHaveLength(1);
    expect(res.config.forms.map(f => `${f.kind}${f.version}`)).toEqual(['match1', 'pit1']);
    expect(currentRecords(db, '2027test', 'match')).toEqual([r]);
    expect(listDevices(db)).toEqual([{ id: 'dev-1', name: 'Tablet 1', lastSyncAt: NOW }]);
  });

  it('acks duplicates without storing them twice', () => {
    const db = setup();
    const r = record(matchForm());
    handleSync(db, { device, records: [r] }, 'b', NOW);
    const again = handleSync(db, { device, records: [r] }, 'b', LATER);
    expect(again.acked).toEqual([{ id: r.id, revision: 1 }]);
    expect(recordHistory(db, r.id)).toHaveLength(1);
  });

  it('keeps every revision and serves the latest', () => {
    const db = setup();
    const r = record(matchForm());
    const r2 = reviseRecord(setAnswer(r, 'auto_coral', 5), LATER);
    handleSync(db, { device, records: [r] }, 'b', NOW);
    handleSync(db, { device, records: [r2] }, 'b', LATER);
    expect(currentRecords(db, '2027test', 'match')).toEqual([r2]);
    expect(recordHistory(db, r.id).map(x => x.revision)).toEqual([1, 2]);
  });

  it('rejects records with an unknown form version or a bad shape', () => {
    const db = setup();
    const bad = { ...record(matchForm()), formVersion: 9 };
    const res = handleSync(db, { device, records: [bad, { id: 'x' } as never] }, 'b', NOW);
    expect(res.acked).toEqual([]);
    expect(res.rejected).toEqual([
      { id: bad.id, revision: 1, reason: 'Unknown match form version 9' },
      { id: 'x', revision: 0, reason: expect.stringContaining('revision must be an integer') },
    ]);
  });

  it('asks only for photos it does not have', () => {
    const db = setup();
    const p = record(pitForm(), { photoIds: ['ph-1', 'ph-2'] });
    putPhoto(db, 'ph-1', p.id, 'image/jpeg', new Uint8Array([1, 2, 3]), NOW);
    expect(handleSync(db, { device, records: [p] }, 'b', NOW).wantedPhotoIds).toEqual(['ph-2']);
    expect(getPhoto(db, 'ph-1')).toEqual({ mime: 'image/jpeg', data: new Uint8Array([1, 2, 3]) });
  });
});

describe('parseSyncRequest', () => {
  it('accepts a well-formed request', () => {
    expect(parseSyncRequest({ device, records: [] })).toEqual({ device, records: [] });
  });
  it.each([
    [null, 'Sync request must be a JSON object'],
    [{ records: [] }, 'Sync request needs device.id and device.name'],
    [{ device }, 'Sync request needs a records list'],
  ])('rejects %j', (body, msg) => expect(parseSyncRequest(body)).toBe(msg));
});

describe('event instances', () => {
  it('gives each event an instance id in the config, new when the event is set up again', () => {
    const db = setup();
    const first = handleSync(db, { device, records: [] }, 'b', NOW).config.eventInstances['2027test'];
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    upsertEvent(db, { key: '2027test', name: 'Renamed' }); // an update keeps the instance
    expect(handleSync(db, { device, records: [] }, 'b', NOW).config.eventInstances['2027test']).toBe(first);
    deleteEvent(db, '2027test');
    upsertEvent(db, { key: '2027test', name: 'Again' });
    expect(handleSync(db, { device, records: [] }, 'b', NOW).config.eventInstances['2027test']).not.toBe(first);
  });

  it('refuses a record made for a deleted event even after an event with the same key is set up again', () => {
    const db = setup();
    const old = handleSync(db, { device, records: [] }, 'b', NOW).config.eventInstances['2027test'];
    deleteEvent(db, '2027test');
    upsertEvent(db, { key: '2027test', name: 'Again' });
    const rec = record(matchForm());
    const res = handleSync(db, { device, records: [rec], eventInstances: { [rec.id]: old } }, 'b', NOW);
    expect(res.rejected).toEqual([{ id: rec.id, revision: 1, reason: 'Event 2027test was deleted on the hub; this record belongs to the deleted one' }]);
    const now = handleSync(db, { device, records: [], eventInstances: {} }, 'b', NOW).config.eventInstances['2027test'];
    expect(handleSync(db, { device, records: [rec], eventInstances: { [rec.id]: now } }, 'b', NOW).acked).toHaveLength(1);
  });

  it('keeps the instances it was sent when parsing a request', () => {
    expect(parseSyncRequest({ device, records: [], eventInstances: { r1: 'i1' } })).toEqual({ device, records: [], eventInstances: { r1: 'i1' } });
  });
});

describe('records for unknown events', () => {
  it('refuses a record for an event that is not on the hub', () => {
    const db = setup();
    const rec = record(matchForm(), { eventKey: '2027gone' });
    const res = handleSync(db, { device, records: [rec] }, 'b', NOW);
    expect(res.rejected).toEqual([{ id: rec.id, revision: 1, reason: "Event 2027gone isn't on the hub (it may have been deleted)" }]);
    expect(currentRecords(db, '2027gone', 'match')).toEqual([]);
  });
});

describe('hub identity', () => {
  it('sends a stable hub id, a season id and the event keys in the config', () => {
    const db = setup();
    upsertEvent(db, { key: '2027other', name: 'Other' });
    const first = handleSync(db, { device, records: [] }, 'b', NOW).config;
    const second = handleSync(db, { device, records: [] }, 'b', NOW).config;
    expect(first.hubId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.seasonId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.hubId).toBe(first.hubId);
    expect(second.seasonId).toBe(first.seasonId);
    expect(first.eventKeys).toEqual(['2027other', '2027test']);
  });
});
