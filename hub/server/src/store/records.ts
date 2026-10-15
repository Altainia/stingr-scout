import type { FormKind, ScoutRecord } from '@stingr/shared';
import type { Db } from '../db';

export type InsertOutcome = 'inserted' | 'duplicate';
type JsonRow = { json: string };

export function insertRecord(db: Db, rec: ScoutRecord, via: 'usb' | 'qr', now: string): InsertOutcome {
  const res = db.prepare(
    'INSERT OR IGNORE INTO records (id, revision, kind, event_key, team, match_key, slot, json, received_at, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(rec.id, rec.revision, rec.kind, rec.eventKey, rec.team, rec.matchKey ?? null, rec.slot ?? null, JSON.stringify(rec), now, via);
  return Number(res.changes) > 0 ? 'inserted' : 'duplicate';
}

export function currentRecords(db: Db, eventKey: string, kind: FormKind): ScoutRecord[] {
  const rows = db.prepare(`
    SELECT r.json FROM records r
    JOIN (SELECT id, MAX(revision) AS rev FROM records WHERE event_key = ? AND kind = ? GROUP BY id) m
      ON r.id = m.id AND r.revision = m.rev
    ORDER BY r.received_at, r.id
  `).all(eventKey, kind) as unknown as JsonRow[];
  return rows.map(r => JSON.parse(r.json) as ScoutRecord);
}

export function recordHistory(db: Db, id: string): ScoutRecord[] {
  const rows = db.prepare('SELECT json FROM records WHERE id = ? ORDER BY revision').all(id) as unknown as JsonRow[];
  return rows.map(r => JSON.parse(r.json) as ScoutRecord);
}
