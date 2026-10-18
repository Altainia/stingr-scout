<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, confirmLabel = 'Yes', cancelLabel = 'Cancel', confirmDisabled = false, onconfirm, oncancel, children }: {
    title: string; confirmLabel?: string; cancelLabel?: string; confirmDisabled?: boolean; onconfirm: () => void; oncancel: () => void; children?: Snippet;
  } = $props();
</script>

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
    <h2>{title}</h2>
    {@render children?.()}
    <div class="actions">
      <button type="button" onclick={oncancel}>{cancelLabel}</button>
      <button type="button" class="primary" disabled={confirmDisabled} onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>
