import type { Db } from '../db';

export function putPhoto(db: Db, id: string, recordId: string, mime: string, data: Uint8Array, now: string): void {
  db.prepare('INSERT OR IGNORE INTO photos (id, record_id, mime, data, received_at) VALUES (?, ?, ?, ?, ?)').run(id, recordId, mime, data, now);
}

export function getPhoto(db: Db, id: string): { mime: string; data: Uint8Array } | undefined {
  const row = db.prepare('SELECT mime, data FROM photos WHERE id = ?').get(id) as unknown as { mime: string; data: Uint8Array } | undefined;
  return row ? { mime: row.mime, data: row.data } : undefined;
}

export function missingPhotoIds(db: Db, ids: string[]): string[] {
  const has = db.prepare('SELECT 1 FROM photos WHERE id = ?');
  return ids.filter(id => has.get(id) === undefined);
}
