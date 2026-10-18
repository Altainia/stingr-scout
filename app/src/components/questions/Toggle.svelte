<script lang="ts">
  import type { AnswerValue, ToggleQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: ToggleQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();
</script>

<div class="choices segmented" role="group" aria-label={question.label}>
  <button type="button" aria-pressed={value === true} onclick={() => { if (value !== true) onchange(true); }}>Yes</button>
  <button type="button" aria-pressed={value === false} onclick={() => { if (value !== false) onchange(false); }}>No</button>
  {#if !question.required}<button type="button" aria-pressed={value === null || value === undefined} onclick={() => onchange(null)}>No answer</button>{/if}
</div>
