<script lang="ts">
  import type { SyncView } from '../lib/syncController';

  let { view, onretry, ondismiss }: { view: SyncView; onretry: () => void; ondismiss: () => void } = $props();
</script>

{#if view.overlay}
  <div class="sync-overlay {view.phase}" role="alertdialog" aria-label="Sync">
    {#if view.phase === 'syncing'}
      <h2>Syncing — do not unplug</h2>
      <progress max={view.progress.total || 1} value={view.progress.done}></progress>
      <p>{view.progress.done} of {view.progress.total} items</p>
    {:else if view.phase === 'done'}
      <h2>✓ Sync complete — safe to unplug</h2>
      <button type="button" class="big" onclick={ondismiss}>OK</button>
    {:else if view.phase === 'error'}
      <h2>Sync failed</h2>
      <p>{view.error}</p>
      <p>Nothing was lost. Records that didn't sync stay on this tablet.</p>
      <div class="row">
        <button type="button" class="big" onclick={onretry}>Retry</button>
        <button type="button" onclick={ondismiss}>Close</button>
      </div>
    {/if}
  </div>
{/if}
