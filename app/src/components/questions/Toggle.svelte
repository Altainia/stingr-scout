<script lang="ts">
  import type { AnswerValue, ToggleQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: ToggleQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();
</script>

<div class="choices" role="group" aria-label={question.label}>
  <button type="button" aria-pressed={value === true} onclick={() => onchange(true)}>Yes</button>
  <button type="button" aria-pressed={value === false} onclick={() => onchange(false)}>No</button>
</div>
