<script lang="ts">
  import type { AnswerValue, TextQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: TextQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let text = $derived(typeof value === 'string' ? value : '');
</script>

{#if question.multiline}
  <textarea aria-label={question.label} rows="4" value={text} oninput={e => onchange(e.currentTarget.value)}></textarea>
{:else}
  <input type="text" aria-label={question.label} value={text} oninput={e => onchange(e.currentTarget.value)} />
{/if}
