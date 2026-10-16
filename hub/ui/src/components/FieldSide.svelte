<script lang="ts">
  import type { Side } from '@stingr/shared';

  let { redSide }: { redSide: Side } = $props();
  let left = $derived(redSide === 'left' ? 'Red' : 'Blue');
  let right = $derived(redSide === 'left' ? 'Blue' : 'Red');
  const fill = (alliance: string) => (alliance === 'Red' ? '#c62828' : '#1565c0');
</script>

<svg class="fieldside" viewBox="0 0 320 170" width="320" height="170" role="img" aria-label="{left} on the left, {right} on the right, as seen from the stands">
  <rect x="10" y="10" width="300" height="110" rx="6" fill="#2e7d32" />
  <line x1="160" y1="10" x2="160" y2="120" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 4" />
  <rect x="10" y="10" width="60" height="110" rx="6" fill={fill(left)} />
  <rect x="250" y="10" width="60" height="110" rx="6" fill={fill(right)} />
  <text x="40" y="70" fill="#ffffff" font-size="15" font-weight="700" text-anchor="middle">{left}</text>
  <text x="280" y="70" fill="#ffffff" font-size="15" font-weight="700" text-anchor="middle">{right}</text>
  <rect x="10" y="134" width="300" height="28" rx="4" fill="var(--chip)" />
  <text x="160" y="153" fill="var(--text)" font-size="13" text-anchor="middle">Scouting stands (you are here)</text>
</svg>
