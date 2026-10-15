import type { EventInfo } from '@stingr/shared';
import type { Db } from '../db';
import { getSetting, setSetting } from './settings';

export function upsertEvent(db: Db, ev: EventInfo): void {
  db.prepare('INSERT INTO events (key, name) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name').run(ev.key, ev.name);
}

export function listEvents(db: Db): EventInfo[] {
  return db.prepare('SELECT key, name FROM events ORDER BY key').all() as unknown as EventInfo[];
}

export function currentEvent(db: Db): EventInfo | null {
  const key = getSetting(db, 'current_event');
  if (!key) return null;
  const row = db.prepare('SELECT key, name FROM events WHERE key = ?').get(key) as unknown as EventInfo | undefined;
  return row ? { key: row.key, name: row.name } : null;
}

export function setCurrentEvent(db: Db, key: string): void {
  if (!db.prepare('SELECT 1 FROM events WHERE key = ?').get(key)) throw new Error(`Unknown event "${key}"`);
  setSetting(db, 'current_event', key);
}
