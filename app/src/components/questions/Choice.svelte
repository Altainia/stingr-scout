<script lang="ts">
  import type { AnswerValue, ChoiceQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: ChoiceQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();
</script>

{#if question.display === 'dropdown'}
  <select aria-label={question.label} value={typeof value === 'string' ? value : ''} onchange={e => onchange(e.currentTarget.value || null)}>
    <option value="">Choose…</option>
    {#each question.options as o, i (i)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
{:else}
  <div class="choices segmented">
    {#each question.options as o, i (i)}
      <button type="button" aria-pressed={value === o.value} onclick={() => onchange(value === o.value ? null : o.value)}>{o.label}</button>
    {/each}
  </div>
{/if}
