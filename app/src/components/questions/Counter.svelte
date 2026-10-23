<script lang="ts">
  import { type AnswerValue, type CounterQuestion, counterJumps } from '@stingr/shared';

  let { question, value, onchange }: { question: CounterQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let current = $derived(typeof value === 'number' ? value : question.default);
  // Bigger jumps (5× and 10× the step) when the range allows; each is greyed out unless the whole jump fits.
  let jumps = $derived(counterJumps(question).map(m => m * question.step));
  let plain = $derived(jumps.length === 1); // just − and +
  const fits = (to: number) => to >= question.min && (question.max === undefined || to <= question.max);
  const name = (dir: 'minus' | 'plus', by: number) => (by === question.step ? dir : `${dir} ${by}`);
</script>

<div class="counter" class:jumps={!plain}>
  {#each jumps.toReversed() as by (by)}
    <button type="button" class:big-jump={by !== question.step} aria-label={name('minus', by)} disabled={!fits(current - by)}
      onclick={() => onchange(current - by)}>{plain ? '−' : `−${by}`}</button>
  {/each}
  <output aria-label="value">{current}</output>
  {#each jumps as by (by)}
    <button type="button" class:big-jump={by !== question.step} aria-label={name('plus', by)} disabled={!fits(current + by)}
      onclick={() => onchange(current + by)}>{plain ? '+' : `+${by}`}</button>
  {/each}
</div>
