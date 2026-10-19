<script lang="ts">
  import type { AnswerValue, TextQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: TextQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let text = $derived(typeof value === 'string' ? value : '');
</script>

{#if question.multiline}
  <textarea aria-label={question.label} rows="4" value={text} oninput={e => onchange(e.currentTarget.value)}></textarea>
{:else}
  <!-- The keyboard's Done key closes the keyboard (in a several-line box, Enter stays a new line). -->
  <input type="text" aria-label={question.label} value={text} enterkeyhint="done" oninput={e => onchange(e.currentTarget.value)}
    onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
{/if}
