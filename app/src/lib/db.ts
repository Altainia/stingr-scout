import type { HubConfig, RecordRef, ScoutRecord, Side, Slot } from '@stingr/shared';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

export type SyncState = 'pending' | 'synced' | 'rejected';
export interface LocalRecord {
  id: string;
  rec: ScoutRecord;
  sync: SyncState;
  reason?: string;
  /** The instance of its event the record was made under (see HubConfig.eventInstances). */
  eventInstance?: string;
  /** The hub that accepted it, so only that hub's deletions remove it from the tablet. */
  hubId?: string;
}
export interface LocalPhoto { id: string; recordId: string; mime: string; data: ArrayBuffer; uploaded: boolean; createdAt: string }
export interface Settings { deviceId: string; deviceName: string; defaultSlot: Slot; scout: string; redSideOverride?: 'event' | Side }
export interface Draft { rec: ScoutRecord; isEdit: boolean }
export interface KvMap { settings: Settings; config: HubConfig; draft: Draft; extraTeams: number[]; lastSyncAt: string }

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  records: { key: string; value: LocalRecord };
  photos: { key: string; value: LocalPhoto };
}

export interface StingrDb {
  getKv<K extends keyof KvMap>(key: K): Promise<KvMap[K] | undefined>;
  setKv<K extends keyof KvMap>(key: K, value: KvMap[K]): Promise<void>;
  deleteKv(key: keyof KvMap): Promise<void>;
  listRecords(): Promise<LocalRecord[]>;
  /** Saves a new or edited record as waiting to sync; an edit keeps the event instance it was first made under. */
  putRecord(rec: ScoutRecord, eventInstance?: string): Promise<void>;
  markSynced(refs: RecordRef[], hubId?: string): Promise<void>;
  markRejected(ref: RecordRef, reason: string): Promise<void>;
  listPhotos(): Promise<LocalPhoto[]>;
  putPhoto(photo: LocalPhoto): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  markPhotoUploaded(id: string): Promise<void>;
  /** Deletes those records, only if still in `state` when given (checked in the same transaction); returns the ids deleted. */
  deleteRecords(ids: string[], state?: SyncState): Promise<string[]>;
  /** Everything but the tablet's own settings: records, photos, the hub's config, any unfinished form. */
  clearAll(): Promise<void>;
}

export async function openStingrDb(name = 'stingr'): Promise<StingrDb> {
  const db = await openDB<Schema>(name, 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('records', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' });
    },
  });
  return wrap(db);
}

function wrap(db: IDBPDatabase<Schema>): StingrDb {
  return {
    async getKv(key) {
      return (await db.get('kv', key)) as never;
    },
    async setKv(key, value) {
      await db.put('kv', value, key);
    },
    async deleteKv(key) {
      await db.delete('kv', key);
    },
    listRecords: () => db.getAll('records'),
    async putRecord(rec, eventInstance) {
      const tx = db.transaction('records', 'readwrite');
      const instance = eventInstance ?? (await tx.store.get(rec.id))?.eventInstance;
      await tx.store.put({ id: rec.id, rec, sync: 'pending', ...(instance ? { eventInstance: instance } : {}) });
      await tx.done;
    },
    async markSynced(refs, hubId) {
      const tx = db.transaction('records', 'readwrite');
      for (const ref of refs) {
        const row = await tx.store.get(ref.id);
        // An edit may have replaced the revision the hub just acknowledged; that newer one is still unsynced.
        if (row && row.rec.revision === ref.revision) {
          const { reason: _reason, ...rest } = row;
          await tx.store.put({ ...rest, sync: 'synced', ...(hubId ? { hubId } : {}) });
        }
      }
      await tx.done;
    },
    async markRejected(ref, reason) {
      const row = await db.get('records', ref.id);
      if (row && row.rec.revision === ref.revision) await db.put('records', { ...row, sync: 'rejected', reason });
    },
    listPhotos: () => db.getAll('photos'),
    async putPhoto(photo) {
      await db.put('photos', photo);
    },
    async deletePhoto(id) {
      await db.delete('photos', id);
    },
    async markPhotoUploaded(id) {
      const p = await db.get('photos', id);
      if (p) await db.put('photos', { ...p, uploaded: true });
    },
    async deleteRecords(ids, state) {
      const tx = db.transaction('records', 'readwrite');
      const deleted: string[] = [];
      for (const id of ids) {
        const row = await tx.store.get(id);
        if (!row || (state && row.sync !== state)) continue; // changed meanwhile (for example edited): keep it
        await tx.store.delete(id);
        deleted.push(id);
      }
      await tx.done;
      return deleted;
    },
    async clearAll() {
      await db.clear('records');
      await db.clear('photos');
      for (const key of ['config', 'draft', 'extraTeams', 'lastSyncAt']) await db.delete('kv', key);
    },
  };
}
