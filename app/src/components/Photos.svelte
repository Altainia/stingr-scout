<script lang="ts">
  import { resizeImage } from '../lib/photos';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let busy = $derived(store.savingPhotos > 0);
  let error = $state<string | null>(null);
  let removing = $state<{ id: string; url: string; n: number } | null>(null); // the photo the scout is asked about

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

<section class="photos" aria-labelledby="photos-title">
  <div class="head">
    <h3 id="photos-title">Robot photos</h3>
    <span class="hint">{thumbs.length === 0 ? 'No photos yet' : thumbs.length === 1 ? '1 photo' : `${thumbs.length} photos`}</span>
  </div>
  {#if thumbs.length}
    <div class="thumbs">
      {#each thumbs as t, i (t.id)}
        <figure>
          <img src={t.url} alt="Robot photo {i + 1}" />
          <button type="button" class="danger" aria-label="Remove photo {i + 1}" onclick={() => (removing = { id: t.id, url: t.url, n: i + 1 })}>Remove</button>
        </figure>
      {/each}
    </div>
  {/if}
  <label class="camera">
    <span>{busy ? 'Saving photo…' : 'Take photo'}</span>
    <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onchange={picked} />
  </label>
  {#if error}<p class="error">{error}</p>{/if}
</section>

{#if removing}
  {@const photo = removing}
  <ConfirmDialog
    title="Remove this photo?"
    confirmLabel="Remove"
    cancelLabel="Keep it"
    onconfirm={() => { const id = photo.id; removing = null; void store.removePhoto(id); }}
    oncancel={() => (removing = null)}
  >
    <img class="confirm-photo" src={photo.url} alt="Robot photo {photo.n}" />
  </ConfirmDialog>
{/if}

<style>
  .photos {
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px 20px; margin: 16px 0 24px;
  }
  .head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
  .head h3 { margin: 0; }
  /* Each photo is a tile: the picture cropped to a fixed size, its Remove button the full width underneath. */
  .thumbs { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
  figure { margin: 0; width: 200px; display: flex; flex-direction: column; gap: 8px; }
  figure img { width: 200px; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); display: block; }
  figure button { width: 100%; }
  .confirm-photo { width: auto; max-width: 100%; height: auto; max-height: 50vh; margin-left: auto; margin-right: auto; object-fit: contain; border-radius: 8px; margin-bottom: 12px; display: block; }
  .camera {
    display: inline-flex; flex-direction: row; align-items: center; justify-content: center;
    min-height: 64px; padding: 0 24px; border: 2px solid var(--line); border-radius: 8px;
    background: var(--accent); color: var(--accent-text); font-size: 1.3rem; cursor: pointer;
  }
</style>
