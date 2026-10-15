import type { EventInfo, Side } from '@stingr/shared';
import type { Db } from '../db';
import { getSetting, setSetting } from './settings';

type EventRow = { key: string; name: string; red_side: Side };
const toEvent = (r: EventRow): EventInfo => ({ key: r.key, name: r.name, redSide: r.red_side });

export function upsertEvent(db: Db, ev: EventInfo): void {
  db.prepare(
    'INSERT INTO events (key, name, red_side) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name, red_side = COALESCE(?, events.red_side)',
  ).run(ev.key, ev.name, ev.redSide ?? 'left', ev.redSide ?? null);
}

export function listEvents(db: Db): EventInfo[] {
  return (db.prepare('SELECT key, name, red_side FROM events ORDER BY key').all() as unknown as EventRow[]).map(toEvent);
}

export function currentEvent(db: Db): EventInfo | null {
  const key = getSetting(db, 'current_event');
  if (!key) return null;
  const row = db.prepare('SELECT key, name, red_side FROM events WHERE key = ?').get(key) as unknown as EventRow | undefined;
  return row ? toEvent(row) : null;
}

export function setCurrentEvent(db: Db, key: string): void {
  if (!db.prepare('SELECT 1 FROM events WHERE key = ?').get(key)) throw new Error(`Unknown event "${key}"`);
  setSetting(db, 'current_event', key);
}
