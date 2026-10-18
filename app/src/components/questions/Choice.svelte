<script lang="ts">
  import type { AnswerValue, ChoiceQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: ChoiceQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let unanswered = $derived(typeof value !== 'string');
</script>

{#if question.display === 'dropdown'}
  <select aria-label={question.label} value={typeof value === 'string' ? value : ''} onchange={e => onchange(e.currentTarget.value || null)}>
    {#if !question.required}
      <option value="">No answer</option>
    {:else if unanswered}
      <option value="" disabled>Choose…</option>
    {/if}
    {#each question.options as o, i (i)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
{:else}
  <div class="choices segmented">
    {#each question.options as o, i (i)}
      <button type="button" aria-pressed={value === o.value} onclick={() => { if (value !== o.value) onchange(o.value); }}>{o.label}</button>
    {/each}
    {#if !question.required}<button type="button" aria-pressed={unanswered} onclick={() => onchange(null)}>No answer</button>{/if}
  </div>
{/if}
