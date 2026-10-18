<script lang="ts">
  import { type AnswerValue, type FormDef, initialValue, type Question, type Side } from '@stingr/shared';
  import QuestionCard from '../../../../app/src/components/QuestionCard.svelte';

  let { form }: { form: FormDef } = $props();
  // Answers are kept per question and type, so changing a question's type starts its answer afresh.
  let answers = $state<Record<string, AnswerValue>>({});
  const slot = (q: Question) => `${q.key}:${q.type}`;
  let missed = $state<string[]>([]);
  let side = $state<Side>('left');
  let tab = $state(0);
  let section = $derived(form.sections[Math.min(tab, form.sections.length - 1)]);
</script>

<section class="preview" aria-label="Tablet preview">
  <div class="row">
    <span class="muted grow">Preview only. Nothing here is saved.</span>
    <label>Preview Red side
      <select aria-label="Preview Red side" value={side} onchange={e => (side = e.currentTarget.value as Side)}>
        <option value="left">Left</option><option value="right">Right</option>
      </select>
    </label>
  </div>
  <nav class="tabs">
    {#each form.sections as s, i (i)}
      <button type="button" aria-pressed={section === s} onclick={() => (tab = i)}>{s.title}</button>
    {/each}
  </nav>
  {#if section}
    {#each section.questions as q, i (i)}
      <QuestionCard
        question={q}
        value={slot(q) in answers ? answers[slot(q)] : initialValue(q)}
        missed={missed.includes(q.key)}
        onchange={v => (answers[slot(q)] = v)}
        onmissed={m => (missed = m ? [...missed, q.key] : missed.filter(k => k !== q.key))}
        venueRedSide={side}
        assets={form.assets}
      />
    {/each}
  {/if}
</section>
