<script lang="ts">
  import { type AnswerValue, findQuestion, markMissed, setAnswer, unansweredRequired, unmarkMissed } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Photos from '../components/Photos.svelte';
  import QuestionCard from '../components/QuestionCard.svelte';
  import { describeAnswer } from '../lib/describe';
  import { recordTitle } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';
  import { keepScreenOn } from '../lib/wakeLock';

  let { store }: { store: AppStore } = $props();

  // The draft disappears the moment it is submitted or discarded, so everything here tolerates null.
  let draft = $derived(store.draft);
  let rec = $derived(draft?.rec ?? null);
  let form = $derived(rec ? store.formOf(rec) : null);
  let sections = $derived(form?.sections ?? []);
  let unanswered = $derived(form && rec ? unansweredRequired(form, rec) : []);
  let tab = $state(0);
  let confirming = $state<'submit' | 'discard' | null>(null);
  let saving = $state(false);

  const label = (key: string) => (form ? findQuestion(form, key)?.label : undefined) ?? key;

  onMount(() => keepScreenOn());

  function show(i: number) {
    tab = i;
    document.documentElement.scrollTop = 0;
  }

  function change(key: string, v: AnswerValue) {
    if (store.draft) void store.updateDraft(setAnswer(store.draft.rec, key, v));
  }

  function setMissed(key: string, missed: boolean) {
    if (!store.draft || !form) return;
    const r = store.draft.rec;
    void store.updateDraft(missed ? markMissed(r, key) : unmarkMissed(form, r, key));
  }

  async function submit() {
    confirming = null;
    saving = true;
    try {
      await store.submitDraft();
    } finally {
      saving = false;
    }
  }
</script>

{#if !draft || !rec}
  <!-- nothing to show: the form was just submitted or discarded -->
{:else if !form}
  <p class="banner warn">This record's form (version {rec.formVersion}) isn't on this tablet. Plug into the hub to sync, then try again.</p>
  <button type="button" onclick={() => store.discardDraft()}>Back</button>
{:else}
  <header class="bar">
    <h1>{recordTitle(rec)}</h1>
    {#if draft.isEdit}<span class="tag">Editing</span>{/if}
    <button type="button" onclick={() => (confirming = 'discard')}>Cancel</button>
  </header>

  <nav class="tabs">
    {#each sections as s, i (s.id)}
      <button type="button" aria-pressed={tab === i} onclick={() => show(i)}>{s.title}</button>
    {/each}
    <button type="button" aria-pressed={tab === sections.length} onclick={() => show(sections.length)}>Review</button>
  </nav>

  {#if tab < sections.length}
    {#each sections[tab].questions as q (q.key)}
      <QuestionCard
        question={q}
        value={rec.answers[q.key] ?? null}
        missed={rec.missed.includes(q.key)}
        onchange={v => change(q.key, v)}
        onmissed={m => setMissed(q.key, m)}
        venueRedSide={store.venueRedSide}
        assets={form.assets}
      />
    {/each}
    <div class="nav">
      <button type="button" disabled={tab === 0} onclick={() => show(tab - 1)}>‹ Back</button>
      <button type="button" class="primary" onclick={() => show(tab + 1)}>Next ›</button>
    </div>
  {:else}
    <section class="review">
      {#if rec.kind === 'pit'}<Photos {store} />{/if}
      {#if unanswered.length}<p class="banner warn">Not answered yet: {unanswered.map(label).join(', ')}</p>{/if}
      {#if rec.missed.length}<p>Marked as missed: {rec.missed.map(label).join(', ')}</p>{/if}
      <section class="summary" aria-label="Your answers">
        {#each sections as s (s.id)}
          <h3>{s.title}</h3>
          <dl>
            {#each s.questions as q (q.key)}
              <dt>{q.label}</dt>
              <dd>{rec.missed.includes(q.key) ? 'Missed' : describeAnswer(q, rec.answers[q.key])}</dd>
            {/each}
          </dl>
        {/each}
      </section>
      <div class="nav">
        <button type="button" onclick={() => show(tab - 1)}>‹ Back</button>
        <button type="button" class="primary big" disabled={saving || store.savingPhotos > 0} onclick={() => (unanswered.length ? (confirming = 'submit') : submit())}>Submit</button>
      </div>
    </section>
  {/if}
{/if}

{#if confirming === 'submit'}
  <ConfirmDialog
    title="Submit with missing answers?"
    confirmLabel="Submit and mark as missed"
    cancelLabel="Go back"
    onconfirm={submit}
    oncancel={() => (confirming = null)}
  >
    <p>You didn't answer: {unanswered.map(label).join(', ')}.</p>
    <p>It's fine to say you missed something. That's better than guessing.</p>
  </ConfirmDialog>
{/if}

{#if confirming === 'discard'}
  <ConfirmDialog
    title={draft?.isEdit ? 'Discard your changes?' : 'Discard this form?'}
    confirmLabel="Discard"
    cancelLabel="Keep editing"
    onconfirm={() => { confirming = null; void store.discardDraft(); }}
    oncancel={() => (confirming = null)}
  />
{/if}
