<script lang="ts">
  import { onMount } from 'svelte';
  import SyncOverlay from './components/SyncOverlay.svelte';
  import type { AppStore } from './lib/store.svelte';
  import type { SyncHandle, SyncView } from './lib/syncController';
  import FormScreen from './screens/FormScreen.svelte';
  import Home from './screens/Home.svelte';
  import PastRecords from './screens/PastRecords.svelte';
  import PitList from './screens/PitList.svelte';
  import QrView from './screens/QrView.svelte';
  import Settings from './screens/Settings.svelte';
  import Setup from './screens/Setup.svelte';

  let { store, sync }: { store: AppStore; sync: SyncHandle } = $props();
  let view = $state<SyncView>(sync.view);
  let persisted = $state<boolean | null>(null);
  let lowStorage = $state(false);

  onMount(() => sync.subscribe(v => { view = v; }));
  onMount(() => {
    navigator.storage?.persist?.().then(p => { persisted = p; }, () => { persisted = false; });
    navigator.storage?.estimate?.().then(e => {
      lowStorage = e.quota !== undefined && e.usage !== undefined && e.quota - e.usage < 50 * 1024 * 1024;
    }, () => {});
  });
</script>

<header class="topbar">
  <span class="brand">Stingr Scout</span>
  <span class="event">{store.event?.name ?? 'No event loaded'}</span>
  {#if store.pendingCount > 0 && (view.phase === 'done' || view.phase === 'error')}
    <button type="button" class="primary" onclick={() => void sync.retry()}>Sync now</button>
  {/if}
  {#if store.screen.name === 'home'}
    <button type="button" class="bar-button" onclick={() => store.go({ name: 'settings' })}>Settings</button>
  {/if}
  <span class="badge" class:ok={store.pendingCount === 0}>
    {store.pendingCount === 0 ? 'All synced ✓' : `${store.pendingCount} unsynced`}
  </span>
</header>

{#if persisted === false}
  <p class="banner warn">This tablet hasn't protected the app's storage. Don't clear Chrome's data until everything is synced.</p>
{/if}
{#if lowStorage}
  <p class="banner warn">This tablet is almost out of storage space. Sync soon, and avoid taking more photos.</p>
{/if}

<main>
  {#if store.screen.name === 'setup'}
    <Setup {store} />
  {:else if store.screen.name === 'form' && store.draft}
    <FormScreen {store} />
  {:else if store.screen.name === 'pit'}
    <PitList {store} />
  {:else if store.screen.name === 'records'}
    <PastRecords {store} />
  {:else if store.screen.name === 'qr'}
    <QrView {store} id={store.screen.id} />
  {:else if store.screen.name === 'settings'}
    <Settings {store} />
  {:else}
    <Home {store} />
  {/if}
</main>

<SyncOverlay {view} onretry={() => void sync.retry()} ondismiss={() => sync.dismiss()} />
