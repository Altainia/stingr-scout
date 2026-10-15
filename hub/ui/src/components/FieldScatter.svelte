<script lang="ts">
  import type { Point } from '@stingr/shared';

  let { image, points, label }: { image?: string; points: Point[]; label: string } = $props();
</script>

<div class="scatter" role="img" aria-label="{label}: {points.length} points">
  {#if image}<img src={image} alt="" />{:else}<p class="muted">No field image in this form.</p>{/if}
  {#each points as p, i (i)}<span class="pt" style:left="{p.x * 100}%" style:top="{p.y * 100}%"></span>{/each}
</div>
