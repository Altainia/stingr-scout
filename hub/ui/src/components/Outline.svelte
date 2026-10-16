<script lang="ts">
  import type { FormDef } from '@stingr/shared';
  import ConfirmDialog from '../../../../app/src/components/ConfirmDialog.svelte';
  import {
    addQuestion, addSection, moveQuestion, moveQuestionTo, moveSection, moveSectionTo, removeQuestion,
    removeSection, renameSection, type Selection, typeLabel,
  } from '../lib/formEdit';

  let { form, selected, onselect, onchange, reserved = new Set<string>() }: {
    form: FormDef; selected: Selection; onselect: (s: Selection) => void; onchange: (f: FormDef) => void; reserved?: Set<string>;
  } = $props();

  let confirmSection = $state<number | null>(null);
  let confirmQuestion = $state<{ si: number; qi: number } | null>(null);

  // Native HTML drag and drop. Where a dragged item would land is shown with a line and applied on drop.
  type Drag = { kind: 'question'; si: number; qi: number } | { kind: 'section'; si: number };
  let drag = $state<Drag | null>(null);
  let dropQ = $state<{ si: number; qi: number } | null>(null); // insertion point for a question
  let dropS = $state<number | null>(null); // insertion point for a section

  function dragStart(e: DragEvent, d: Drag) {
    drag = d;
    e.dataTransfer?.setData('text/plain', d.kind); // Firefox needs data to start a drag
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function dragEnd() {
    drag = null;
    dropQ = null;
    dropS = null;
  }
  const lowerHalf = (e: DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };
  function overQuestion(e: DragEvent, si: number, qi: number) {
    if (drag?.kind !== 'question') return;
    e.preventDefault();
    e.stopPropagation(); // the section's own handler would move the line to the end
    dropQ = { si, qi: lowerHalf(e) ? qi + 1 : qi };
  }
  function overSection(e: DragEvent, si: number) {
    if (!drag) return;
    e.preventDefault();
    if (drag.kind === 'question') dropQ = { si, qi: form.sections[si].questions.length };
    else dropS = lowerHalf(e) ? si + 1 : si;
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    if (drag?.kind === 'question' && dropQ) {
      const r = moveQuestionTo(form, drag, dropQ);
      onchange(r.form);
      onselect({ si: r.si, qi: r.qi });
    } else if (drag?.kind === 'section' && dropS !== null) {
      onchange(moveSectionTo(form, drag.si, dropS));
      onselect({ si: 0, qi: null });
    }
    dragEnd();
  }

  function add(si: number) {
    const next = addQuestion(form, si, 'counter', 'New question', reserved); // its type is changed in the settings panel
    onchange(next);
    onselect({ si, qi: next.sections[si].questions.length - 1 });
  }

  function move(si: number, qi: number, delta: -1 | 1) {
    const r = moveQuestion(form, si, qi, delta);
    onchange(r.form);
    onselect({ si: r.si, qi: r.qi });
  }

  function remove(si: number, qi: number) {
    onchange(removeQuestion(form, si, qi));
    onselect({ si, qi: null });
  }

  function deleteSection(si: number) {
    confirmSection = null;
    onchange(removeSection(form, si));
    onselect({ si: 0, qi: null });
  }
</script>

<div class="outline">
  {#each form.sections as s, si (si)}
    <section
      class="card"
      class:drop-before={dropS === si}
      aria-label="Section {s.title}"
      ondragover={e => overSection(e, si)}
      ondrop={drop}
    >
      <div class="row">
        <span class="handle" draggable="true" title="Drag to reorder" role="presentation"
          ondragstart={e => dragStart(e, { kind: 'section', si })} ondragend={dragEnd}>⠿</span>
        <input aria-label="Section title" value={s.title} oninput={e => onchange(renameSection(form, si, e.currentTarget.value))} />
        <button type="button" class="small" aria-label="Move section {s.title} up" disabled={si === 0} onclick={() => onchange(moveSection(form, si, -1))}>↑</button>
        <button type="button" class="small" aria-label="Move section {s.title} down" disabled={si === form.sections.length - 1} onclick={() => onchange(moveSection(form, si, 1))}>↓</button>
        <button type="button" class="small" aria-label="Delete section {s.title}" onclick={() => (s.questions.length ? (confirmSection = si) : deleteSection(si))}>✕</button>
      </div>
      {#if s.questions.length === 0}<p class="muted">No questions yet.</p>{/if}
      <ul class="list">
        {#each s.questions as q, qi (qi)}
          <li
            class:selected={selected.si === si && selected.qi === qi}
            class:drop-before={dropQ?.si === si && dropQ.qi === qi}
            draggable="true"
            ondragstart={e => dragStart(e, { kind: 'question', si, qi })}
            ondragend={dragEnd}
            ondragover={e => overQuestion(e, si, qi)}
          >
            <button type="button" class="link grow" onclick={() => onselect({ si, qi })}>
              {q.label}{#if q.required} *{/if} <span class="muted">· {typeLabel(q.type)}</span>
            </button>
            <button type="button" class="small" aria-label="Move {q.label} up" onclick={() => move(si, qi, -1)}>↑</button>
            <button type="button" class="small" aria-label="Move {q.label} down" onclick={() => move(si, qi, 1)}>↓</button>
            <button type="button" class="small" aria-label="Delete {q.label}" onclick={() => (confirmQuestion = { si, qi })}>✕</button>
          </li>
        {/each}
      </ul>
      {#if dropQ?.si === si && dropQ.qi === s.questions.length}<div class="drop-end"></div>{/if}
      <div class="row">
        <button type="button" onclick={() => add(si)}>Add question to {s.title}</button>
      </div>
    </section>
  {/each}
  {#if dropS === form.sections.length}<div class="drop-end"></div>{/if}
  <button type="button" onclick={() => onchange(addSection(form))}>Add section</button>
</div>

{#if confirmQuestion}
  {@const target = confirmQuestion}
  <ConfirmDialog
    title="Delete “{form.sections[target.si]?.questions[target.qi]?.label}”?"
    confirmLabel="Delete"
    cancelLabel="Keep it"
    onconfirm={() => { const { si, qi } = target; confirmQuestion = null; remove(si, qi); }}
    oncancel={() => (confirmQuestion = null)}
  >
    <p>It is removed from the draft. Answers already collected with published versions are kept.</p>
  </ConfirmDialog>
{/if}

{#if confirmSection !== null}
  {@const doomed = form.sections[confirmSection]}
  <ConfirmDialog
    title="Delete section “{doomed?.title}”?"
    confirmLabel="Delete"
    cancelLabel="Keep it"
    onconfirm={() => deleteSection(confirmSection ?? 0)}
    oncancel={() => (confirmSection = null)}
  >
    <p>Its {doomed?.questions.length} questions are removed from the draft. Data already collected with published versions is kept.</p>
  </ConfirmDialog>
{/if}
