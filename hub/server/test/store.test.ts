import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb, schemaVersion } from '../src/db';
import { currentEvent, listEvents, setCurrentEvent, upsertEvent } from '../src/store/events';
import { addTeam, listSchedule, listTeams, removeTeam, replaceSchedule } from '../src/store/schedule';
import { getSetting, setSetting } from '../src/store/settings';

describe('openDb', () => {
  it('creates the schema once and reopens an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stingr-'));
    try {
      const path = join(dir, 'x.db');
      const a = openDb(path);
      expect(schemaVersion(a)).toBe(1);
      upsertEvent(a, { key: '2027a', name: 'A' });
      a.close();
      const b = openDb(path);
      expect(listEvents(b)).toEqual([{ key: '2027a', name: 'A' }]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('settings', () => {
  it('stores, replaces and deletes values', () => {
    const db = openDb(':memory:');
    expect(getSetting(db, 'tba_key')).toBeNull();
    setSetting(db, 'tba_key', 'abc');
    setSetting(db, 'tba_key', 'def');
    expect(getSetting(db, 'tba_key')).toBe('def');
    setSetting(db, 'tba_key', null);
    expect(getSetting(db, 'tba_key')).toBeNull();
  });
});

describe('events', () => {
  it('upserts, lists and tracks the current event', () => {
    const db = openDb(':memory:');
    expect(currentEvent(db)).toBeNull();
    upsertEvent(db, { key: '2027b', name: 'B' });
    upsertEvent(db, { key: '2027a', name: 'A' });
    upsertEvent(db, { key: '2027a', name: 'A2' });
    expect(listEvents(db)).toEqual([{ key: '2027a', name: 'A2' }, { key: '2027b', name: 'B' }]);
    setCurrentEvent(db, '2027b');
    expect(currentEvent(db)).toEqual({ key: '2027b', name: 'B' });
    expect(() => setCurrentEvent(db, 'nope')).toThrow('Unknown event "nope"');
  });
});

describe('schedule and teams', () => {
  it('lists the schedule in match order and derives teams', () => {
    const db = openDb(':memory:');
    upsertEvent(db, { key: 'e', name: 'E' });
    addTeam(db, 'e', 9999);
    replaceSchedule(db, 'e', [
      { matchKey: 'qm10', red: [1, 2, 3], blue: [4, 5, 6] },
      { matchKey: 'qm9', red: [6, 5, 4], blue: [3, 2, 0] },
      { matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] },
    ]);
    expect(listSchedule(db, 'e').map(m => m.matchKey)).toEqual(['qm1', 'qm9', 'qm10']);
    expect(listSchedule(db, 'e')[1]).toEqual({ matchKey: 'qm9', red: [6, 5, 4], blue: [3, 2, 0] });
    expect(listTeams(db, 'e')).toEqual([1, 2, 3, 4, 5, 6, 9999]);
  });

  it('replacing the schedule drops old matches but keeps teams', () => {
    const db = openDb(':memory:');
    upsertEvent(db, { key: 'e', name: 'E' });
    replaceSchedule(db, 'e', [{ matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] }]);
    replaceSchedule(db, 'e', [{ matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] }]);
    expect(listSchedule(db, 'e').map(m => m.matchKey)).toEqual(['qm2']);
    expect(listTeams(db, 'e')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('removes a team', () => {
    const db = openDb(':memory:');
    upsertEvent(db, { key: 'e', name: 'E' });
    addTeam(db, 'e', 5098);
    addTeam(db, 'e', 5098);
    addTeam(db, 'e', 254);
    removeTeam(db, 'e', 5098);
    expect(listTeams(db, 'e')).toEqual([254]);
  });
});
