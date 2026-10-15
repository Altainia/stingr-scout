<script lang="ts">
  import { type AnswerValue, type FieldMapQuestion, type Point, toCanonical, toDisplay } from '@stingr/shared';
  import { tapToPoint } from '../../lib/fieldmap';

  let { question, value, onchange, rotated, image }: {
    question: FieldMapQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void; rotated: boolean; image?: string;
  } = $props();

  let points = $derived(Array.isArray(value) ? (value as Point[]) : []);
  let shown = $derived(points.map(p => toDisplay(p, rotated)));

  function tap(e: MouseEvent & { currentTarget: HTMLImageElement }) {
    const p = toCanonical(tapToPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()), rotated);
    if (question.maxPoints === 1) onchange([p]);
    else if (points.length < question.maxPoints) onchange([...points, p]);
  }
</script>

<div class="fieldmap">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <img src={image} alt="Field" draggable="false" style:transform={rotated ? 'rotate(180deg)' : undefined} onclick={tap} />
  {#each shown as p, i (i)}
    <button
      type="button" class="dot" aria-label="Remove point {i + 1}" style:left="{p.x * 100}%" style:top="{p.y * 100}%"
      onclick={() => onchange(points.filter((_, j) => j !== i))}
    ></button>
  {/each}
</div>
<p class="hint">{points.length} of {question.maxPoints} marked. Tap a dot to remove it.</p>
