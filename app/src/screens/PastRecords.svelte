<script lang="ts">
  import { recordTitle } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();

  let list = $derived(
    store.records
      .filter(r => !store.event || r.rec.eventKey === store.event.key)
      .toSorted((a, b) => b.rec.updatedAt.localeCompare(a.rec.updatedAt)),
  );
</script>

<section>
  <header class="bar">
    <h1>Past records</h1>
    <button type="button" onclick={() => store.go({ name: 'home' })}>Back</button>
  </header>
  {#if list.length === 0}<p>No records yet.</p>{/if}
  <ul class="list">
    {#each list as r (r.id)}
      <li aria-label={recordTitle(r.rec)}>
        <span class="grow">
          {recordTitle(r.rec)}{#if r.rec.noShow} · <em>not present</em>{/if}{#if r.rec.missed.length} · {r.rec.missed.length} missed{/if}
        </span>
        <span class={r.sync}>{r.sync === 'synced' ? 'Synced ✓' : r.sync === 'rejected' ? `Rejected: ${r.reason ?? ''}` : 'Not synced'}</span>
        {#if r.rec.noShow}
          <button type="button" onclick={() => store.undoNoShow(r.id)}>Undo / scout anyway</button>
        {:else}
          <button type="button" onclick={() => store.editRecord(r.id)}>Edit</button>
        {/if}
        <button type="button" onclick={() => store.go({ name: 'qr', id: r.id })}>Show QR</button>
      </li>
    {/each}
  </ul>
</section>
