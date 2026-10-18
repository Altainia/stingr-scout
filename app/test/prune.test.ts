import { describe, expect, it } from 'vitest';
import { matchForm, record } from '../../shared/test/fixtures';
import { openStingrDb, type StingrDb } from '../src/lib/db';
import { pruneForHub } from '../src/lib/prune';
import { CONFIG } from './helpers';

async function tablet() {
  const db = await openStingrDb(`prune-${Math.random()}`);
  const kept = record(matchForm(), { eventKey: '2027test' });
  const gone = record(matchForm(), { eventKey: '2027gone', photoIds: ['p1'] });
  const unsynced = record(matchForm(), { eventKey: '2027gone' });
  for (const r of [kept, gone, unsynced]) await db.putRecord(r);
  await db.markSynced([{ id: kept.id, revision: 1 }, { id: gone.id, revision: 1 }]);
  await db.putPhoto({ id: 'p1', recordId: gone.id, mime: 'image/png', data: new ArrayBuffer(1), uploaded: true, createdAt: 'x' });
  return { db, kept, gone, unsynced };
}
const ids = async (db: StingrDb) => (await db.listRecords()).map(r => r.id).sort();

describe('pruneForHub', () => {
  it('removes synced records (and photos) of events the hub no longer has, keeping anything unsynced', async () => {
    const { db, kept, unsynced } = await tablet();
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, eventKeys: ['2027test'] })).toBe(1);
    expect(await ids(db)).toEqual([kept.id, unsynced.id].sort());
    expect(await db.listPhotos()).toEqual([]);
  });

  it('removes every synced record after a new season', async () => {
    const { db, unsynced } = await tablet();
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, seasonId: 'season-2', eventKeys: ['2027test', '2027gone'] })).toBe(2);
    expect(await ids(db)).toEqual([unsynced.id]);
  });

  it('removes nothing after syncing with a different hub, or the first time', async () => {
    const { db } = await tablet();
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, hubId: 'hub-2', eventKeys: [] })).toBe(0);
    expect(await pruneForHub(db, undefined, { ...CONFIG, eventKeys: [] })).toBe(0);
    expect(await ids(db)).toHaveLength(3);
  });

  it('only removes records synced to this hub', async () => {
    const db = await openStingrDb(`prune-${Math.random()}`);
    const toB = record(matchForm(), { eventKey: '2027gone' });
    const toA = record(matchForm(), { eventKey: '2027gone' });
    for (const r of [toB, toA]) await db.putRecord(r);
    await db.markSynced([{ id: toB.id, revision: 1 }], 'hub-B');
    await db.markSynced([{ id: toA.id, revision: 1 }], 'hub-1');
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, eventKeys: [] })).toBe(1); // hub-1 is CONFIG's hub
    expect(await ids(db)).toEqual([toB.id]);
  });

  it("removes synced records of a deleted event even when an event with the same key was set up again", async () => {
    const db = await openStingrDb(`prune-${Math.random()}`);
    const old = record(matchForm(), { eventKey: '2027test' });
    await db.putRecord(old, 'instance-old');
    await db.markSynced([{ id: old.id, revision: 1 }], 'hub-1');
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, eventInstances: { '2027test': 'instance-new' } })).toBe(1);
    expect(await ids(db)).toEqual([]);
  });

  it('keeps a record whose new edit is waiting, even if it was listed for removal', async () => {
    const db = await openStingrDb(`prune-${Math.random()}`);
    const r = record(matchForm(), { eventKey: '2027gone' });
    await db.putRecord(r);
    await db.markSynced([{ id: r.id, revision: 1 }], 'hub-1');
    await db.putRecord({ ...r, revision: 2 }); // edited after the list was made: pending again
    await db.deleteRecords([r.id], 'synced');
    expect(await ids(db)).toEqual([r.id]);
  });
});
