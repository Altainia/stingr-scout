<script lang="ts">
  import { ApiError } from '../lib/api';

  let { error }: { error: unknown } = $props();

  let message = $derived(error ? (error instanceof Error ? error.message : String(error)) : null);
  let needsEvent = $derived(error instanceof ApiError && error.status === 409);
</script>

{#if message}
  <p class="banner warn" role="alert">
    {message}{#if needsEvent} <a href="#/event">Go to Event setup</a>{/if}
  </p>
{/if}
