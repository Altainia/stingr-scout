import { randomUUID } from 'node:crypto';
import type { EventInfo, Side } from '@stingr/shared';
import type { Db } from '../db';
import { getSetting, setSetting } from './settings';

type EventRow = { key: string; name: string; red_side: Side };
const toEvent = (r: EventRow): EventInfo => ({ key: r.key, name: r.name, redSide: r.red_side });

export function upsertEvent(db: Db, ev: EventInfo): void {
  db.prepare(
    'INSERT INTO events (key, name, red_side, instance) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name, red_side = COALESCE(?, events.red_side)',
  ).run(ev.key, ev.name, ev.redSide ?? 'left', randomUUID(), ev.redSide ?? null);
}

export function listEvents(db: Db): EventInfo[] {
  return (db.prepare('SELECT key, name, red_side FROM events ORDER BY key').all() as unknown as EventRow[]).map(toEvent);
}

/** event key → the instance id it got when it was set up */
export function eventInstances(db: Db): Record<string, string> {
  const rows = db.prepare('SELECT key, instance FROM events ORDER BY key').all() as unknown as { key: string; instance: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.instance]));
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
