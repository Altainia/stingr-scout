import type { AllianceEntry, AllianceField, AllianceSide } from '@stingr/shared';
import type { Db } from '../db';
import { getSetting, setSetting } from './settings';

export const ALLIANCE_FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** This season's alliance fields (kept across events). */
export function allianceFields(db: Db): AllianceField[] {
  const raw = getSetting(db, 'alliance_fields');
  return raw ? (JSON.parse(raw) as AllianceField[]) : [];
}

/** Replaces the fields; values of fields that are gone are removed. */
export function setAllianceFields(db: Db, fields: AllianceField[]): void {
  setSetting(db, 'alliance_fields', fields.length ? JSON.stringify(fields) : null);
  const keep = new Set(['score', ...fields.map(f => f.key)]);
  const items = db.prepare('SELECT DISTINCT item FROM alliance_results').all() as unknown as { item: string }[];
  for (const { item } of items) if (!keep.has(item)) db.prepare('DELETE FROM alliance_results WHERE item = ?').run(item);
}

/** match → alliance → item → value, for an event. */
export function allianceValues(db: Db, eventKey: string): Map<string, Record<AllianceSide, Record<string, AllianceEntry>>> {
  const rows = db.prepare('SELECT match_key, alliance, item, value, source FROM alliance_results WHERE event_key = ?').all(eventKey) as unknown as
    { match_key: string; alliance: AllianceSide; item: string; value: number; source: 'manual' | 'tba' }[];
  const out = new Map<string, Record<AllianceSide, Record<string, AllianceEntry>>>();
  for (const r of rows) {
    const m = out.get(r.match_key) ?? { red: {}, blue: {} };
    m[r.alliance][r.item] = { value: Number(r.value), source: r.source };
    out.set(r.match_key, m);
  }
  return out;
}

/** Records a value; null removes it. */
export function setAllianceValue(
  db: Db, eventKey: string, matchKey: string, alliance: AllianceSide, item: string, value: number | null, source: 'manual' | 'tba', now: string,
): void {
  if (value === null) {
    db.prepare('DELETE FROM alliance_results WHERE event_key = ? AND match_key = ? AND alliance = ? AND item = ?').run(eventKey, matchKey, alliance, item);
    return;
  }
  db.prepare(`INSERT INTO alliance_results (event_key, match_key, alliance, item, value, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (event_key, match_key, alliance, item) DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at`)
    .run(eventKey, matchKey, alliance, item, value, source, now);
}
