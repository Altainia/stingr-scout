import { type Db, tx } from '../db';
import { newSeasonId } from './identity';
import { getSetting, setSetting } from './settings';

export interface EventCounts { matches: number; teams: number; records: number; photos: number }
export interface SeasonCounts { events: number; records: number; photos: number; forms: number; drafts: number; devices: number }

const count = (db: Db, sql: string, ...args: string[]): number => Number((db.prepare(sql).get(...args) as unknown as { n: number }).n);

/** What deleting an event would remove (records counted once however many revisions they have); null if there's no such event. */
export function eventCounts(db: Db, key: string): EventCounts | null {
  if (!db.prepare('SELECT 1 FROM events WHERE key = ?').get(key)) return null;
  return {
    matches: count(db, 'SELECT COUNT(*) AS n FROM matches WHERE event_key = ?', key),
    teams: count(db, 'SELECT COUNT(*) AS n FROM teams WHERE event_key = ?', key),
    records: count(db, 'SELECT COUNT(DISTINCT id) AS n FROM records WHERE event_key = ?', key),
    photos: count(db, 'SELECT COUNT(*) AS n FROM photos WHERE record_id IN (SELECT id FROM records WHERE event_key = ?)', key),
  };
}

/** Removes an event with its schedule, teams, records and photos. Forms are kept. */
export function deleteEvent(db: Db, key: string): EventCounts {
  const counts = eventCounts(db, key);
  if (!counts) throw new Error(`Unknown event "${key}"`);
  tx(db, () => {
    db.prepare('DELETE FROM photos WHERE record_id IN (SELECT id FROM records WHERE event_key = ?)').run(key);
    for (const table of ['records', 'matches', 'teams']) db.prepare(`DELETE FROM ${table} WHERE event_key = ?`).run(key);
    db.prepare('DELETE FROM events WHERE key = ?').run(key);
    if (getSetting(db, 'current_event') === key) setSetting(db, 'current_event', null);
  });
  return counts;
}

export function seasonCounts(db: Db): SeasonCounts {
  return {
    events: count(db, 'SELECT COUNT(*) AS n FROM events'),
    records: count(db, 'SELECT COUNT(DISTINCT id) AS n FROM records'),
    photos: count(db, 'SELECT COUNT(*) AS n FROM photos'),
    forms: count(db, 'SELECT COUNT(*) AS n FROM forms'),
    drafts: count(db, 'SELECT COUNT(*) AS n FROM form_drafts'),
    devices: count(db, 'SELECT COUNT(*) AS n FROM devices'),
  };
}

/**
 * Removes every event, record, photo, form and draft and the list of tablets; keeps hub settings. Form numbering
 * carries on from the highest version published, so old tablet records can't be taken for new-form ones.
 */
export function startNewSeason(db: Db): SeasonCounts {
  const counts = seasonCounts(db);
  tx(db, () => {
    for (const kind of ['match', 'pit']) {
      const latest = count(db, 'SELECT COALESCE(MAX(version), 0) AS n FROM forms WHERE kind = ?', kind);
      const floor = Math.max(latest, Number(getSetting(db, `form_version_floor:${kind}`) ?? 0));
      setSetting(db, `form_version_floor:${kind}`, String(floor));
    }
    for (const table of ['photos', 'records', 'matches', 'teams', 'events', 'forms', 'form_drafts', 'devices']) db.exec(`DELETE FROM ${table}`);
    setSetting(db, 'current_event', null);
    newSeasonId(db);
  });
  return counts;
}
