import type { Db } from '../db';

/** concern id → how many misses it had when it was acknowledged */
export function missedAcks(db: Db, eventKey: string): Map<string, number> {
  const rows = db.prepare('SELECT concern, missed FROM missed_acks WHERE event_key = ?').all(eventKey) as unknown as { concern: string; missed: number }[];
  return new Map(rows.map(r => [r.concern, Number(r.missed)]));
}

export function acknowledgeMissed(db: Db, eventKey: string, concern: string, missed: number, now: string): void {
  db.prepare('INSERT INTO missed_acks (event_key, concern, missed, at) VALUES (?, ?, ?, ?) ON CONFLICT (event_key, concern) DO UPDATE SET missed = excluded.missed, at = excluded.at')
    .run(eventKey, concern, missed, now);
}

export function unacknowledgeMissed(db: Db, eventKey: string, concern: string): void {
  db.prepare('DELETE FROM missed_acks WHERE event_key = ? AND concern = ?').run(eventKey, concern);
}
