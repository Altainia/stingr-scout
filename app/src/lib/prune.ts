import type { HubConfig } from '@stingr/shared';
import type { StingrDb } from './db';

/**
 * After a sync, drop synced records (and their photos) the hub no longer has: those of deleted events, or all of
 * them after the hub started a new season. Only for the same hub; unsynced records are always kept.
 */
export async function pruneForHub(db: StingrDb, before: HubConfig | undefined, after: HubConfig): Promise<number> {
  if (!before?.hubId || before.hubId !== after.hubId) return 0;
  const newSeason = before.seasonId !== after.seasonId;
  const events = new Set(after.eventKeys);
  const gone = (await db.listRecords()).filter(r => r.sync === 'synced' && (newSeason || !events.has(r.rec.eventKey)));
  if (!gone.length) return 0;
  const ids = new Set(gone.map(r => r.id));
  await db.deleteRecords([...ids]);
  for (const p of await db.listPhotos()) if (ids.has(p.recordId)) await db.deletePhoto(p.id);
  return gone.length;
}
