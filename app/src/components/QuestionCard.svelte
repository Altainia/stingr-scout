<script lang="ts">
  import type { AnswerValue, Question, Slot } from '@stingr/shared';
  import Choice from './questions/Choice.svelte';
  import Counter from './questions/Counter.svelte';
  import FieldMap from './questions/FieldMap.svelte';
  import Multi from './questions/Multi.svelte';
  import NumberField from './questions/NumberField.svelte';
  import Rating from './questions/Rating.svelte';
  import TextField from './questions/TextField.svelte';
  import Timer from './questions/Timer.svelte';
  import Toggle from './questions/Toggle.svelte';

  let { question, value, missed, onchange, onmissed, slot, assets }: {
    question: Question;
    value: AnswerValue;
    missed: boolean;
    onchange: (v: AnswerValue) => void;
    onmissed: (missed: boolean) => void;
    slot?: Slot;
    assets: Record<string, string>;
  } = $props();
</script>

<section class="question" class:missed aria-label={question.label}>
  <header>
    <h3>{question.label}{#if question.required}<span class="req" title="Required"> *</span>{/if}</h3>
    {#if missed}
      <button type="button" class="link" onclick={() => onmissed(false)}>Undo</button>
    {:else}
      <button type="button" class="link" onclick={() => onmissed(true)}>I missed this</button>
    {/if}
  </header>
  {#if question.help}<p class="hint">{question.help}</p>{/if}
  {#if missed}
    <p class="hint">Marked as missed.</p>
  {:else if question.type === 'counter'}
    <Counter {question} {value} {onchange} />
  {:else if question.type === 'toggle'}
    <Toggle {question} {value} {onchange} />
  {:else if question.type === 'choice'}
    <Choice {question} {value} {onchange} />
  {:else if question.type === 'multi'}
    <Multi {question} {value} {onchange} />
  {:else if question.type === 'number'}
    <NumberField {question} {value} {onchange} />
  {:else if question.type === 'text'}
    <TextField {question} {value} {onchange} />
  {:else if question.type === 'rating'}
    <Rating {question} {value} {onchange} />
  {:else if question.type === 'timer'}
    <Timer {question} {value} {onchange} />
  {:else if question.type === 'fieldmap'}
    <FieldMap {question} {value} {onchange} {slot} image={assets[question.assetId]} />
  {/if}
</section>
