<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { recordTitle } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();

  let list = $derived(
    store.records
      .filter(r => !store.event || r.rec.eventKey === store.event.key)
      .toSorted((a, b) => b.rec.updatedAt.localeCompare(a.rec.updatedAt)),
  );
  // Records of other events that still matter: not yet synced, or refused by the hub.
  let otherUnsynced = $derived(store.otherEventRecords.filter(r => r.sync !== 'synced'));
  let syncedOther = $derived(store.otherEventRecords.filter(r => r.sync === 'synced').length);
  let refused = $derived(store.records.filter(r => r.sync === 'rejected').length);
  let confirming = $state<'other' | 'refused' | null>(null);
  const records = (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`;
  const status = (r: (typeof store.records)[number]) =>
    r.sync === 'synced' ? 'Synced ✓' : r.sync === 'rejected' ? `Rejected: ${r.reason ?? ''}` : 'Not synced';
</script>

<section>
  <header class="bar">
    <h1>Past records</h1>
    <button type="button" onclick={() => store.go({ name: 'home' })}>Back</button>
  </header>
  {#if list.length === 0}<p>No records yet.</p>{/if}
  <ul class="list">
    {#each list as r (r.id)}
      <li aria-label={recordTitle(r.rec, store.config?.teamNames)}>
        <span class="grow">
          {recordTitle(r.rec, store.config?.teamNames)}{#if r.rec.noShow} · <em>not present</em>{/if}{#if r.rec.missed.length} · {r.rec.missed.length} missed{/if}
        </span>
        <span class={r.sync}>{status(r)}</span>
        {#if r.rec.noShow}
          <button type="button" onclick={() => store.undoNoShow(r.id, 'records')}>Undo / scout anyway</button>
        {:else}
          <button type="button" onclick={() => store.editRecord(r.id, 'records')}>Edit</button>
        {/if}
        <button type="button" onclick={() => store.go({ name: 'qr', id: r.id })}>Show QR</button>
      </li>
    {/each}
  </ul>

  {#if otherUnsynced.length}
    <section aria-labelledby="other-title">
      <h2 id="other-title" class="sub">Other events</h2>
      <ul class="list">
        {#each otherUnsynced as r (r.id)}
          <li aria-label="{recordTitle(r.rec, store.config?.teamNames)} ({r.rec.eventKey})">
            <span class="grow">{recordTitle(r.rec, store.config?.teamNames)} · {r.rec.eventKey}</span>
            <span class={r.sync}>{status(r)}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if syncedOther || refused}
    <div class="row">
      {#if syncedOther}<button type="button" onclick={() => (confirming = 'other')}>Remove synced records from other events…</button>{/if}
      {#if refused}<button type="button" class="danger" onclick={() => (confirming = 'refused')}>Delete refused records…</button>{/if}
    </div>
  {/if}
</section>

{#if confirming === 'other'}
  <ConfirmDialog
    title="Remove {syncedOther} synced {syncedOther === 1 ? 'record' : 'records'} from other events?"
    confirmLabel="Remove"
    cancelLabel="Keep them"
    onconfirm={async () => { confirming = null; await store.removeSyncedFromOtherEvents(); }}
    oncancel={() => (confirming = null)}
  >
    <p>The hub already has {syncedOther === 1 ? 'it' : 'them'}. Records not yet synced are kept.</p>
  </ConfirmDialog>
{/if}

{#if confirming === 'refused'}
  <ConfirmDialog
    title="Delete {records(refused)} the hub refused?"
    confirmLabel="Delete"
    cancelLabel="Keep them"
    onconfirm={async () => { confirming = null; await store.deleteRefused(); }}
    oncancel={() => (confirming = null)}
  >
    <p>{refused === 1 ? 'It' : 'They'} can't be synced, because the hub no longer has {refused === 1 ? 'its' : 'their'} event or form.</p>
  </ConfirmDialog>
{/if}
