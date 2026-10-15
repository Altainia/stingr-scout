<script lang="ts">
  import type { AnswerValue, RatingQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: RatingQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let levels = $derived(Array.from({ length: question.max }, (_, i) => i + 1));
</script>

<div class="choices" role="group" aria-label={question.label}>
  {#each levels as n (n)}
    <button type="button" aria-pressed={value === n} onclick={() => onchange(value === n ? null : n)}>{n}</button>
  {/each}
</div>
