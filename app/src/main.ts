import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { openStingrDb } from './lib/db';
import { AppStore } from './lib/store.svelte';
import { watchForUpdates } from './lib/swUpdate';
import { pingHub, runSync } from './lib/sync';
import { SyncController } from './lib/syncController';

// Calling the global fetch through a wrapper keeps it bound (Chrome throws "Illegal invocation" otherwise).
const http: typeof fetch = (input, init) => fetch(input, init);

const db = await openStingrDb();
const store = new AppStore({ db });
await store.load();

const sync = new SyncController({
  ping: () => pingHub(http),
  sync: onProgress =>
    runSync(
      { db, fetch: http, device: { id: store.settings.deviceId, name: store.settings.deviceName }, now: () => new Date().toISOString() },
      onProgress,
    ),
  hasPending: async () => (await db.listRecords()).some(r => r.sync === 'pending'),
  onSynced: () => store.reload(),
});

mount(App, { target: document.getElementById('app')!, props: { store, sync } });
sync.start();

void watchForUpdates({
  currentBuild: __BUILD_ID__,
  sync,
  isSafe: () => store.screen.name === 'home' && !store.draft && sync.view.phase !== 'syncing',
});
