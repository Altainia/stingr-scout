import { describe, expect, it } from 'vitest';
import { matchForm, record } from '../../shared/test/fixtures';
import { openStingrDb } from '../src/lib/db';

const fresh = () => openStingrDb(`db-test-${Math.random()}`);

describe('key/value settings', () => {
  it('stores, reads and deletes values', async () => {
    const db = await fresh();
    expect(await db.getKv('lastSyncAt')).toBeUndefined();
    await db.setKv('lastSyncAt', '2027-03-01T10:00:00.000Z');
    expect(await db.getKv('lastSyncAt')).toBe('2027-03-01T10:00:00.000Z');
    await db.deleteKv('lastSyncAt');
    expect(await db.getKv('lastSyncAt')).toBeUndefined();
  });
});

describe('records', () => {
  it('stores a submitted record as pending', async () => {
    const db = await fresh();
    const r = record(matchForm());
    await db.putRecord(r);
    expect(await db.listRecords()).toEqual([{ id: r.id, rec: r, sync: 'pending' }]);
  });

  it('marks a record synced only if the acked revision is still the latest', async () => {
    const db = await fresh();
    const r1 = record(matchForm());
    await db.putRecord(r1);
    await db.putRecord({ ...r1, revision: 2 });
    await db.markSynced([{ id: r1.id, revision: 1 }]);
    expect((await db.listRecords())[0].sync).toBe('pending');
    await db.markSynced([{ id: r1.id, revision: 2 }]);
    expect((await db.listRecords())[0].sync).toBe('synced');
  });

  it('records why the hub rejected a record', async () => {
    const db = await fresh();
    const r = record(matchForm());
    await db.putRecord(r);
    await db.markRejected({ id: r.id, revision: 1 }, 'Unknown match form version 1');
    expect((await db.listRecords())[0]).toMatchObject({ sync: 'rejected', reason: 'Unknown match form version 1' });
  });
});

describe('photos', () => {
  it('stores image bytes and upload state', async () => {
    const db = await fresh();
    const data = new Uint8Array([1, 2, 3]).buffer;
    await db.putPhoto({ id: 'p1', recordId: 'r1', mime: 'image/jpeg', data, uploaded: false, createdAt: 't' });
    const [p] = await db.listPhotos();
    expect(new Uint8Array(p.data)).toEqual(new Uint8Array([1, 2, 3]));
    await db.markPhotoUploaded('p1');
    expect((await db.listPhotos())[0].uploaded).toBe(true);
    await db.deletePhoto('p1');
    expect(await db.listPhotos()).toEqual([]);
  });
});
