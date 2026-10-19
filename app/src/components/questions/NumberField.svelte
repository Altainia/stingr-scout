<script lang="ts">
  import type { AnswerValue, NumberQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: NumberQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let n = $derived(typeof value === 'number' ? value : null);
  let range = $derived(
    question.min !== undefined && question.max !== undefined ? ` from ${question.min} to ${question.max}`
      : question.min !== undefined ? ` of at least ${question.min}`
        : question.max !== undefined ? ` of at most ${question.max}` : '',
  );
  let outOfRange = $derived(
    n !== null && ((question.min !== undefined && n < question.min) || (question.max !== undefined && n > question.max) || (question.integer && !Number.isInteger(n))),
  );
</script>

<input
  type="number"
  aria-label={question.label}
  inputmode={question.integer ? 'numeric' : 'decimal'}
  step={question.integer ? 1 : 'any'}
  min={question.min}
  max={question.max}
  value={n ?? ''}
  oninput={e => { const t = e.currentTarget.value; onchange(t === '' ? null : Number(t)); }}
  enterkeyhint="done"
  onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
/>
{#if outOfRange}
  <p class="hint warn">Expected {question.integer ? 'a whole number' : 'a number'}{range}</p>
{/if}
