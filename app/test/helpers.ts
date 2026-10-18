import type { HubConfig } from '@stingr/shared';
import { matchForm, pitForm, record } from '../../shared/test/fixtures';
import { openStingrDb, type Settings, type StingrDb } from '../src/lib/db';
import { AppStore } from '../src/lib/store.svelte';

export const CONFIG: HubConfig = {
  hubId: 'hub-1',
  seasonId: 'season-1',
  eventKeys: ['2027test'],
  event: { key: '2027test', name: 'Test Event' },
  forms: [matchForm(), pitForm()],
  schedule: [
    { matchKey: 'qm1', red: [5098, 0, 3], blue: [4, 5, 6] },
    { matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] },
  ],
  teams: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5098],
  appBuild: 'hub-build',
};

let dbCount = 0;

export async function makeStore(opts: { config?: HubConfig | null; settings?: Partial<Settings> } = {}): Promise<{ store: AppStore; db: StingrDb }> {
  const db = await openStingrDb(`store-test-${++dbCount}-${Math.random()}`);
  const config = opts.config === undefined ? CONFIG : opts.config;
  if (config) await db.setKv('config', structuredClone(config));
  await db.setKv('settings', { deviceId: 'dev-1', deviceName: 'Tablet 1', defaultSlot: 'red1', scout: 'Ada', ...opts.settings });
  let id = 0;
  const store = new AppStore({ db, now: () => '2027-03-01T10:00:00.000Z', newId: () => `id-${++id}` });
  await store.load();
  return { store, db };
}

/** A tablet holding a synced record of this event, a synced and an unsynced one of an older event, and one the hub refused. */
export async function withMixedRecords() {
  const ctx = await makeStore();
  const here = record(matchForm(), { eventKey: '2027test' });
  const old = record(matchForm(), { eventKey: '2027old' });
  const oldUnsynced = record(matchForm(), { eventKey: '2027old', slot: 'blue1' });
  const refused = record(matchForm(), { eventKey: '2027gone', slot: 'blue2' });
  for (const r of [here, old, oldUnsynced, refused]) await ctx.db.putRecord(r);
  await ctx.db.markSynced([{ id: here.id, revision: 1 }, { id: old.id, revision: 1 }]);
  await ctx.db.markRejected({ id: refused.id, revision: 1 }, "Event 2027gone isn't on the hub (it may have been deleted)");
  await ctx.store.reload();
  return { ...ctx, here, old, oldUnsynced, refused };
}
