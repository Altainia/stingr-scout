<script lang="ts">
  import { type AnswerValue, DIM_PART_LABELS, type DimPart, type Dimensions, type DimensionsQuestion, fromFeetInches, isDimensions, toFeetInches } from '@stingr/shared';
  import { untrack } from 'svelte';

  // Feet and inches for each measurement the question asks; the answer keeps inches. What the scout types stays as
  // typed (so 30 inches isn't rewritten mid-typing) and is tidied into feet and inches when they leave the box.
  let { question, value, onchange }: { question: DimensionsQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  type Boxes = { feet: string; inches: string };
  const dims = (v: AnswerValue): Dimensions => (isDimensions(v) ? v : {});
  const boxesFor = (inches: number | undefined): Boxes => {
    if (inches === undefined) return { feet: '', inches: '' };
    const split = toFeetInches(inches);
    return { feet: String(split.feet), inches: String(split.inches) };
  };
  const num = (s: string): number | null => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
  const totalOf = (b: Boxes) => fromFeetInches(num(b.feet), num(b.inches));

  let boxes = $state<Partial<Record<DimPart, Boxes>>>(untrack(() => Object.fromEntries(question.parts.map(p => [p, boxesFor(dims(value)[p])]))));
  // An answer changed from outside (cleared, or reopened): show it.
  $effect(() => {
    const v = dims(value);
    untrack(() => {
      for (const p of question.parts) if (totalOf(boxes[p] ?? boxesFor(undefined)) !== (v[p] ?? null)) boxes[p] = boxesFor(v[p]);
    });
  });

  function typed(p: DimPart, which: keyof Boxes, text: string) {
    boxes[p] = { ...(boxes[p] ?? boxesFor(undefined)), [which]: text };
    const next: Dimensions = { ...dims(value) };
    const total = totalOf(boxes[p]);
    if (total === null) delete next[p];
    else next[p] = total;
    onchange(Object.keys(next).length ? next : null);
  }
  const tidy = (p: DimPart) => (boxes[p] = boxesFor(dims(value)[p]));
  let negative = $derived(Object.values(dims(value)).some(n => n < 0));
</script>

<div class="dimensions">
  {#each question.parts as p (p)}
    {@const b = boxes[p] ?? { feet: '', inches: '' }}
    <div class="dimension" role="group" aria-label={DIM_PART_LABELS[p]}>
      <span class="part">{DIM_PART_LABELS[p]}</span>
      {#each [['feet', 'ft'], ['inches', 'in']] as const as [which, unit] (which)}
        <label class="unit">
          <input type="number" class="narrow" aria-label="{DIM_PART_LABELS[p]} {which}" inputmode="decimal" step="any" min="0" value={b[which]}
            oninput={e => typed(p, which, e.currentTarget.value)} onchange={() => tidy(p)}
            enterkeyhint="done" onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          {unit}
        </label>
      {/each}
    </div>
  {/each}
</div>
{#if negative}<p class="hint warn">Measurements can’t be negative</p>{/if}
