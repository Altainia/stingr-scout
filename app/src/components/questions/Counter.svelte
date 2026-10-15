<script lang="ts">
  import type { AnswerValue, CounterQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: CounterQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let current = $derived(typeof value === 'number' ? value : question.default);
  let canDown = $derived(current - question.step >= question.min);
  let canUp = $derived(question.max === undefined || current + question.step <= question.max);
</script>

<div class="counter">
  <button type="button" aria-label="minus" disabled={!canDown} onclick={() => onchange(current - question.step)}>−</button>
  <output aria-label="value">{current}</output>
  <button type="button" aria-label="plus" disabled={!canUp} onclick={() => onchange(current + question.step)}>+</button>
</div>
