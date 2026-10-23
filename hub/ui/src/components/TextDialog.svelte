<script lang="ts">
  import { onMount } from 'svelte';

  // Shows a long piece of text in full. Escape, a click outside or Close closes it.
  let { title, text, onclose }: { title: string; text: string; onclose: () => void } = $props();

  let closeButton: HTMLButtonElement | undefined = $state();
  let pressedOutside = false;

  onMount(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton?.focus();
    return () => before?.focus?.();
  });
</script>

<svelte:document onkeydown={e => { if (e.key === 'Escape') { e.preventDefault(); onclose(); } }} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="backdrop"
  role="presentation"
  onpointerdown={e => (pressedOutside = e.target === e.currentTarget)}
  onclick={e => { if (pressedOutside && e.target === e.currentTarget) onclose(); pressedOutside = false; }}
>
  <div class="dialog text-dialog" role="dialog" aria-modal="true" aria-label={title}>
    <h2>{title}</h2>
    <p class="full-text">{text}</p>
    <div class="actions"><button type="button" bind:this={closeButton} onclick={onclose}>Close</button></div>
  </div>
</div>
