<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { title, confirmLabel = 'Yes', cancelLabel = 'Cancel', confirmDisabled = false, onconfirm, oncancel, children }: {
    title: string; confirmLabel?: string; cancelLabel?: string; confirmDisabled?: boolean; onconfirm: () => void; oncancel: () => void; children?: Snippet;
  } = $props();

  let dialog: HTMLElement | undefined = $state();
  let cancelButton: HTMLButtonElement | undefined = $state();
  let pressedOutside = false; // a click only counts as "outside" if it also started outside (not a drag from inside)

  // Start on something safe: a box to type in (typed confirmations), otherwise the cancel button. Enter never confirms.
  onMount(() => {
    const before = document.activeElement as HTMLElement | null;
    const box = dialog?.querySelector<HTMLElement>('input, textarea, select');
    (box ?? cancelButton)?.focus();
    return () => before?.focus?.();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<svelte:document onkeydown={onKey} />

<!-- Clicking the dimmed area outside the dialog cancels, like Escape. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="backdrop"
  role="presentation"
  onpointerdown={e => (pressedOutside = e.target === e.currentTarget)}
  onclick={e => { if (pressedOutside && e.target === e.currentTarget) oncancel(); pressedOutside = false; }}
>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} bind:this={dialog}>
    <h2>{title}</h2>
    {@render children?.()}
    <div class="actions">
      <button type="button" bind:this={cancelButton} onclick={oncancel}>{cancelLabel}</button>
      <button type="button" class="primary" disabled={confirmDisabled} onclick={onconfirm}
        onkeydown={e => { if (e.key === 'Enter') e.preventDefault(); }}>{confirmLabel}</button>
    </div>
  </div>
</div>
