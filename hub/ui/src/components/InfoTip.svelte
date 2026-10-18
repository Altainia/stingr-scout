<script lang="ts">
  import type { Snippet } from 'svelte';

  // A small "i" button that opens an explanation below it. Escape, a click elsewhere or the button again closes it.
  let { label, children }: { label: string; children: Snippet } = $props();

  const id = $props.id();
  let open = $state(false);
  let root: HTMLElement | undefined = $state();
  let pop: HTMLElement | undefined = $state();
  let shift = $state(0); // moves the popup left when it would run off the right edge of the window

  $effect(() => {
    if (!open || !pop) {
      shift = 0;
      return;
    }
    const over = pop.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
    if (over > 0) shift = -over;
  });

  function onDocumentClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onKey} />

<span class="info" bind:this={root}>
  <button type="button" class="info-btn" aria-label={label} aria-expanded={open} aria-controls={id} onclick={() => (open = !open)}>i</button>
  {#if open}
    <div class="info-pop" {id} role="dialog" aria-label={label} bind:this={pop} style:translate="{shift}px 0">{@render children()}</div>
  {/if}
</span>
