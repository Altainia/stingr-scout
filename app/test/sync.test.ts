import type { SyncRequest, SyncResponse } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../shared/test/fixtures';
import { openStingrDb, type StingrDb } from '../src/lib/db';
import { pingHub, runSync, type SyncProgress } from '../src/lib/sync';
import { CONFIG } from './helpers';

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function fakeHub(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const posted = (init?: RequestInit) => JSON.parse(String(init?.body)) as SyncRequest;

/** A hub that acknowledges every record except the ids in `reject`, and accepts photos. */
function okHub(reject: string[] = [], photo: Handler = () => new Response(null, { status: 204 })) {
  return fakeHub((url, init) => {
    if (url === '/api/sync') {
      const req = posted(init);
      const res: SyncResponse = {
        acked: req.records.filter(r => !reject.includes(r.id)).map(r => ({ id: r.id, revision: r.revision })),
        rejected: req.records.filter(r => reject.includes(r.id)).map(r => ({ id: r.id, revision: r.revision, reason: 'Unknown match form version 1' })),
        wantedPhotoIds: [],
        config: CONFIG,
      };
      return json(res);
    }
    if (url.startsWith('/api/photos/')) return photo(url, init);
    return json({ error: 'not found' }, 404);
  });
}

const device = { id: 'dev-1', name: 'Tablet 1' };
const NOW = '2027-03-01T12:00:00.000Z';
const fresh = () => openStingrDb(`sync-test-${Math.random()}`);
const deps = (db: StingrDb, fetchImpl: typeof fetch) => ({ db, fetch: fetchImpl, device, now: () => NOW });
const sorted = (ids: string[]) => [...ids].sort();

describe('pingHub', () => {
  it('returns the hub build id', async () => {
    expect(await pingHub(fakeHub(() => json({ hub: 'stingr-scout', appBuild: 'b7' })).fetchImpl)).toEqual({ appBuild: 'b7' });
  });
  it('returns null when the hub is unreachable or is not a Stingr hub', async () => {
    expect(await pingHub((async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch)).toBeNull();
    expect(await pingHub(fakeHub(() => json({ hub: 'something-else' })).fetchImpl)).toBeNull();
    expect(await pingHub(fakeHub(() => json({}, 500)).fetchImpl)).toBeNull();
  });
});

describe('runSync', () => {
  it('sends unsynced records, marks them synced and stores the hub config', async () => {
    const db = await fresh();
    const a = record(matchForm());
    const b = record(matchForm(), { slot: 'blue1' });
    const c = record(matchForm(), { slot: 'red3' });
    for (const r of [a, b, c]) await db.putRecord(r);
    await db.markSynced([{ id: c.id, revision: 1 }]);
    const hub = okHub();
    const progress: SyncProgress[] = [];

    const result = await runSync(deps(db, hub.fetchImpl), p => progress.push(p));

    const req = posted(hub.calls[0].init);
    expect(req.device).toEqual(device);
    expect(sorted(req.records.map(r => r.id))).toEqual(sorted([a.id, b.id]));
    expect((await db.listRecords()).every(r => r.sync === 'synced')).toBe(true);
    expect(await db.getKv('config')).toEqual(CONFIG);
    expect(await db.getKv('lastSyncAt')).toBe(NOW);
    expect(result).toEqual({ acked: 2, rejected: 0, photos: 0, removed: 0, config: CONFIG });
    expect(progress).toEqual([{ done: 0, total: 2 }, { done: 2, total: 2 }]); // counts records, not batches
  });

  it('drops synced records of events the hub deleted', async () => {
    const db = await fresh();
    await db.setKv('config', { ...CONFIG, eventKeys: ['2027test', '2027gone'] });
    const old = record(matchForm(), { eventKey: '2027gone' });
    await db.putRecord(old);
    await db.markSynced([{ id: old.id, revision: 1 }]);
    const result = await runSync(deps(db, okHub().fetchImpl)); // the hub's config lists only 2027test now
    expect(result.removed).toBe(1);
    expect(await db.listRecords()).toEqual([]);
  });

  it('still fetches the hub config when nothing is waiting', async () => {
    const db = await fresh();
    const hub = okHub();
    await runSync(deps(db, hub.fetchImpl));
    expect(hub.calls).toHaveLength(1);
    expect(posted(hub.calls[0].init).records).toEqual([]);
    expect(await db.getKv('config')).toEqual(CONFIG);
  });

  it('sends records in batches', async () => {
    const db = await fresh();
    for (let i = 0; i < 30; i++) await db.putRecord(record(matchForm()));
    const hub = okHub();
    await runSync(deps(db, hub.fetchImpl));
    expect(hub.calls.map(c => posted(c.init).records.length)).toEqual([25, 5]);
  });

  it('reports progress in records and photos', async () => {
    const db = await fresh();
    for (let i = 0; i < 30; i++) await db.putRecord(record(matchForm()));
    const progress: SyncProgress[] = [];
    await runSync(deps(db, okHub().fetchImpl), p => progress.push(p));
    expect(progress).toEqual([{ done: 0, total: 30 }, { done: 25, total: 30 }, { done: 30, total: 30 }]);
  });

  it('marks rejected records and tries them again next time', async () => {
    const db = await fresh();
    const a = record(matchForm());
    await db.putRecord(a);
    const first = await runSync(deps(db, okHub([a.id]).fetchImpl));
    expect(first.rejected).toBe(1);
    expect((await db.listRecords())[0]).toMatchObject({ sync: 'rejected', reason: 'Unknown match form version 1' });
    const hub = okHub();
    await runSync(deps(db, hub.fetchImpl));
    expect(posted(hub.calls[0].init).records.map(r => r.id)).toEqual([a.id]);
    expect((await db.listRecords())[0].sync).toBe('synced');
  });

  it('uploads photos of synced records and holds back the rest', async () => {
    const db = await fresh();
    const kept = record(pitForm(), { photoIds: ['p1'] });
    const refused = record(pitForm(), { team: 254, photoIds: ['p2'] });
    await db.putRecord(kept);
    await db.putRecord(refused);
    await db.putPhoto({ id: 'p1', recordId: kept.id, mime: 'image/jpeg', data: new Uint8Array([1, 2]).buffer, uploaded: false, createdAt: NOW });
    await db.putPhoto({ id: 'p2', recordId: refused.id, mime: 'image/jpeg', data: new Uint8Array([3]).buffer, uploaded: false, createdAt: NOW });
    const hub = okHub([refused.id]);

    const result = await runSync(deps(db, hub.fetchImpl));

    const puts = hub.calls.filter(c => c.init?.method === 'PUT');
    expect(puts.map(c => c.url)).toEqual([`/api/photos/p1?recordId=${kept.id}`]);
    expect(new Headers(puts[0].init?.headers).get('content-type')).toBe('image/jpeg');
    expect(result.photos).toBe(1);
    const photos = await db.listPhotos();
    expect(photos.find(p => p.id === 'p1')?.uploaded).toBe(true);
    expect(photos.find(p => p.id === 'p2')?.uploaded).toBe(false);
  });

  it("does not upload a photo the synced record doesn't list", async () => {
    const db = await fresh();
    const pit = record(pitForm(), { photoIds: ['p1'] });
    await db.putRecord(pit);
    await db.markSynced([{ id: pit.id, revision: 1 }]);
    // p2 belongs to an edit of this record that hasn't been submitted (and may be discarded).
    for (const id of ['p1', 'p2']) {
      await db.putPhoto({ id, recordId: pit.id, mime: 'image/jpeg', data: new Uint8Array([1]).buffer, uploaded: false, createdAt: NOW });
    }
    const hub = okHub();
    await runSync(deps(db, hub.fetchImpl));
    expect(hub.calls.filter(c => c.init?.method === 'PUT').map(c => c.url)).toEqual([`/api/photos/p1?recordId=${pit.id}`]);
    expect((await db.listPhotos()).find(p => p.id === 'p2')?.uploaded).toBe(false);
  });

  it('keeps photos queued when the connection drops mid-upload', async () => {
    const db = await fresh();
    const pit = record(pitForm(), { photoIds: ['p1', 'p2'] });
    await db.putRecord(pit);
    for (const id of ['p1', 'p2']) {
      await db.putPhoto({ id, recordId: pit.id, mime: 'image/jpeg', data: new Uint8Array([1]).buffer, uploaded: false, createdAt: NOW });
    }
    let puts = 0;
    const hub = okHub([], () => {
      puts++;
      if (puts === 2) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 204 });
    });
    await expect(runSync(deps(db, hub.fetchImpl))).rejects.toThrow('Lost the connection to the hub');
    const photos = await db.listPhotos();
    expect(photos.find(p => p.id === 'p1')?.uploaded).toBe(true);
    expect(photos.find(p => p.id === 'p2')?.uploaded).toBe(false);
    expect((await db.listRecords())[0].sync).toBe('synced');
  });

  it("reports the hub's error message and leaves records waiting", async () => {
    const db = await fresh();
    await db.putRecord(record(matchForm()));
    const hub = fakeHub(() => json({ error: 'Disk full' }, 500));
    await expect(runSync(deps(db, hub.fetchImpl))).rejects.toThrow('Disk full');
    expect((await db.listRecords())[0].sync).toBe('pending');
  });

  it('explains a dropped connection', async () => {
    const db = await fresh();
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await expect(runSync(deps(db, offline))).rejects.toThrow('Lost the connection to the hub');
  });
});
