import type { HubConfig } from '@stingr/shared';
import type { StingrDb } from './db';

/**
 * After a sync, drop synced records (and their photos) the hub no longer has: those of deleted events (including an
 * event deleted and set up again under the same key), or all of them after the hub started a new season. Only
 * records this hub accepted are considered; unsynced records are always kept.
 */
export async function pruneForHub(db: StingrDb, before: HubConfig | undefined, after: HubConfig): Promise<number> {
  if (!before?.hubId) return 0; // first sync, or a tablet updated from before hubs had ids
  const sameHub = before.hubId === after.hubId;
  const newSeason = sameHub && before.seasonId !== after.seasonId;
  const events = new Set(after.eventKeys);
  const instances = after.eventInstances ?? {};
  const gone = (await db.listRecords()).filter(r => {
    if (r.sync !== 'synced') return false;
    const syncedTo = r.hubId ?? (sameHub ? after.hubId : undefined); // older rows: assume the hub they last synced with
    if (syncedTo !== after.hubId) return false;
    const key = r.rec.eventKey;
    return newSeason || !events.has(key) || (r.eventInstance !== undefined && instances[key] !== r.eventInstance);
  });
  if (!gone.length) return 0;
  const deleted = new Set(await db.deleteRecords(gone.map(r => r.id), 'synced'));
  for (const p of await db.listPhotos()) if (deleted.has(p.recordId)) await db.deletePhoto(p.id);
  return deleted.size;
}
