import type { HubConfig, RecordRef, ScoutRecord, Side, Slot } from '@stingr/shared';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

export type SyncState = 'pending' | 'synced' | 'rejected';
export interface LocalRecord { id: string; rec: ScoutRecord; sync: SyncState; reason?: string }
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
  putRecord(rec: ScoutRecord): Promise<void>;
  markSynced(refs: RecordRef[]): Promise<void>;
  markRejected(ref: RecordRef, reason: string): Promise<void>;
  listPhotos(): Promise<LocalPhoto[]>;
  putPhoto(photo: LocalPhoto): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  markPhotoUploaded(id: string): Promise<void>;
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
    async putRecord(rec) {
      await db.put('records', { id: rec.id, rec, sync: 'pending' });
    },
    async markSynced(refs) {
      const tx = db.transaction('records', 'readwrite');
      for (const ref of refs) {
        const row = await tx.store.get(ref.id);
        // An edit may have replaced the revision the hub just acknowledged; that newer one is still unsynced.
        if (row && row.rec.revision === ref.revision) await tx.store.put({ id: row.id, rec: row.rec, sync: 'synced' });
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
  };
}
