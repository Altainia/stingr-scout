<script lang="ts">
  import type { AnswerValue, MultiQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: MultiQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let selected = $derived(Array.isArray(value) ? (value as string[]) : []);

  function toggle(v: string) {
    onchange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
</script>

<div class="choices">
  {#each question.options as o (o.value)}
    <button type="button" aria-pressed={selected.includes(o.value)} onclick={() => toggle(o.value)}>{o.label}</button>
  {/each}
</div>
