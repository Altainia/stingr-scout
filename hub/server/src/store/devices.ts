import type { DeviceInfo } from '@stingr/shared';
import type { Db } from '../db';

export type DeviceRow = { id: string; name: string; lastSyncAt: string | null };

export function touchDevice(db: Db, d: DeviceInfo, now: string): void {
  db.prepare('INSERT INTO devices (id, name, last_sync_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, last_sync_at = excluded.last_sync_at')
    .run(d.id, d.name, now);
}

export function listDevices(db: Db): DeviceRow[] {
  const rows = db.prepare('SELECT id, name, last_sync_at FROM devices ORDER BY name, id').all() as unknown as { id: string; name: string; last_sync_at: string | null }[];
  return rows.map(r => ({ id: r.id, name: r.name, lastSyncAt: r.last_sync_at }));
}
