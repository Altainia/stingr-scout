<script lang="ts">
  import { resizeImage } from '../lib/photos';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let busy = $derived(store.savingPhotos > 0);
  let error = $state<string | null>(null);

  let thumbs = $derived(
    (store.draft?.rec.photoIds ?? []).flatMap(id => {
      const p = store.photos.find(x => x.id === id);
      return p ? [{ id, url: URL.createObjectURL(new Blob([p.data], { type: p.mime })) }] : [];
    }),
  );

  $effect(() => {
    const list = thumbs;
    return () => list.forEach(t => URL.revokeObjectURL(t.url));
  });

  async function picked(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    error = null;
    try {
      await store.trackPhoto(async () => {
        const blob = await resizeImage(file);
        await store.addPhoto(await blob.arrayBuffer(), blob.type || 'image/jpeg');
      });
    } catch {
      error = "Couldn't save that photo. Please try again.";
    }
  }
</script>

<section class="photos" aria-label="Robot photos">
  <h3>Robot photos</h3>
  <div class="thumbs">
    {#each thumbs as t (t.id)}
      <figure>
        <img src={t.url} alt="Robot photo" />
        <button type="button" onclick={() => store.removePhoto(t.id)}>Remove</button>
      </figure>
    {/each}
  </div>
  <label class="camera">
    <span>{busy ? 'Saving photo…' : 'Take photo'}</span>
    <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onchange={picked} />
  </label>
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .camera {
    display: inline-flex; flex-direction: row; align-items: center; justify-content: center;
    min-height: 64px; padding: 0 24px; border: 2px solid var(--black); border-radius: 8px;
    background: var(--yellow); font-size: 1.3rem; cursor: pointer;
  }
</style>
