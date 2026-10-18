import { describe, expect, it } from 'vitest';
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
    expect(eventCounts(db, '2027aaa')).toEqual({ matches: 1, teams: 6, records: 1, photos: 1 });
    expect(eventCounts(db, '2027zzz')).toBeNull();
    expect(deleteEvent(db, '2027aaa')).toEqual({ matches: 1, teams: 6, records: 1, photos: 1 });
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
    expect(seasonCounts(db)).toEqual({ events: 2, records: 2, photos: 1, forms: 2, drafts: 1, devices: 1 });
    expect(startNewSeason(db)).toEqual({ events: 2, records: 2, photos: 1, forms: 2, drafts: 1, devices: 1 });
    expect(seasonCounts(db)).toEqual({ events: 0, records: 0, photos: 0, forms: 0, drafts: 0, devices: 0 });
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
