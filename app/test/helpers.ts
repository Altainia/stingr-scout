import type { HubConfig } from '@stingr/shared';
import { matchForm, pitForm } from '../../shared/test/fixtures';
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
