<script lang="ts">
  import { allQuestions, type FormDef, type FormKind, type Question, type QuestionType, validateFormDef } from '@stingr/shared';
  import { onDestroy, onMount } from 'svelte';
  import ConfirmDialog from '../../../../app/src/components/ConfirmDialog.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import Outline from '../components/Outline.svelte';
  import Preview from '../components/Preview.svelte';
  import QuestionProps from '../components/QuestionProps.svelte';
  import type { Api } from '../lib/api';
  import { emptyForm, looksLikeForm, pruneAssets, type Selection } from '../lib/formEdit';

  let { api, kind }: { api: Api; kind: FormKind } = $props();

  let form = $state<FormDef | null>(null);
  let published = $state<FormDef[]>([]);
  let isDraft = $state(false);
  let refused = $state<string[]>([]); // what the hub refused on the last publish
  let warnings = $state<string[]>([]); // notes from the last successful publish
  let showProblems = $state(false);
  let publishing = $state(false);
  let pendingImport = $state<{ name: string; form: FormDef } | null>(null);
  let status = $state<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  let selected = $state<Selection>({ si: 0, qi: null });
  let error = $state<unknown>(null);
  let message = $state<string | null>(null);
  let confirmDiscard = $state(false);
  let showPreview = $state(true);
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Each question's settings for every type it has been while this page is open, so switching back restores them.
  const typeMemory = new Map<string, Partial<Record<QuestionType, Question>>>();

  let mine = $derived(published.filter(f => f.kind === kind));
  let latest = $derived(mine.at(-1) ?? null);
  let lockedKeys = $derived(new Set(mine.flatMap(f => allQuestions(f).map(q => q.key))));
  let lockedOptions = $derived.by(() => {
    const m = new Map<string, Set<string>>();
    for (const f of mine) {
      for (const q of allQuestions(f)) {
        if (q.type !== 'choice' && q.type !== 'multi') continue;
        const set = m.get(q.key) ?? new Set<string>();
        for (const o of q.options) set.add(o.value);
        m.set(q.key, set);
      }
    }
    return m;
  });
  // Checked here as the mentor edits; shown only when asked for ("Show problems").
  let problems = $derived.by(() => {
    if (!form) return [] as string[];
    try {
      return validateFormDef(pruneAssets($state.snapshot(form) as FormDef), mine).errors;
    } catch {
      return ['The form is malformed. Undo the last change or import a fresh copy.'];
    }
  });
  let nothingToPublish = $derived(!isDraft && status === 'saved');
  $effect(() => {
    if (problems.length === 0) showProblems = false;
  });

  let statusText = $derived(
    status === 'saving' ? 'Saving…'
      : status === 'unsaved' ? 'Unsaved changes…'
        : status === 'error' ? "Couldn't save the draft (see the message above)."
          : isDraft ? `Draft saved · not published yet${latest ? ` (published: version ${latest.version})` : ''}`
            : latest ? `Published version ${latest.version} · no unpublished changes` : 'Nothing published yet',
  );

  onMount(async () => {
    try {
      const [d, forms] = await Promise.all([api.draft(kind), api.forms()]);
      published = forms;
      isDraft = d.isDraft;
      form = d.draft ?? emptyForm(kind);
    } catch (e) {
      error = e;
    }
  });

  // Leaving the page must not lose an edit: save what is waiting, and retry a save that failed.
  onDestroy(() => {
    if (timer) {
      clearTimeout(timer);
      void save();
    } else if (status === 'error') {
      void save();
    }
  });

  // Closing or reloading the tab: start saving at once and ask the browser to hold the page until it lands.
  onMount(() => {
    const onLeave = (e: Event) => {
      if (timer) {
        clearTimeout(timer);
        void save();
      }
      if (status !== 'saved') e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  });

  function edit(next: FormDef) {
    edits++;
    form = next;
    status = 'unsaved';
    message = null;
    refused = [];
    warnings = [];
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(), 600);
  }

  let saving: Promise<void> | null = null; // the save request in flight, if any
  let edits = 0; // counts edits, so a save that finishes after a newer edit doesn't claim "saved"

  function save(): Promise<void> {
    timer = null;
    if (!form) return Promise.resolve();
    const snapshot = pruneAssets($state.snapshot(form) as FormDef);
    const editsAtStart = edits;
    status = 'saving';
    const run = (async () => {
      try {
        const check = await api.saveDraft(kind, snapshot);
        isDraft = true;
        warnings = check.warnings; // e.g. a published question's type changed
        if (edits === editsAtStart && !timer) status = 'saved';
      } catch (e) {
        status = 'error';
        error = e;
      }
    })();
    saving = run;
    void run.finally(() => { if (saving === run) saving = null; });
    return run;
  }

  /** Make sure the hub has every edit. Returns false if the latest save failed. */
  async function settle(): Promise<boolean> {
    if (timer) {
      clearTimeout(timer);
      await save();
    }
    while (saving) await saving;
    return status !== 'error';
  }

  async function publish() {
    if (publishing) return;
    publishing = true;
    try {
      // Never publish an older draft than what is on screen.
      if (!(await settle())) return;
      await publishNow();
    } finally {
      publishing = false;
    }
  }

  async function publishNow() {
    error = null;
    try {
      const res = await api.publish(kind);
      if (res.ok) {
        published = [...published, res.form];
        form = res.form;
        isDraft = false;
        refused = [];
        warnings = res.warnings;
        message = `Published version ${res.form.version}. Tablets get it on their next sync.`;
      } else {
        refused = res.errors;
        warnings = res.warnings;
      }
    } catch (e) {
      error = e;
    }
  }

  async function discard() {
    confirmDiscard = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    while (saving) await saving; // otherwise a late save would bring the discarded draft back
    try {
      const d = await api.discardDraft(kind);
      form = d.draft ?? emptyForm(kind);
      isDraft = false;
      status = 'saved';
      refused = [];
      warnings = [];
      selected = { si: 0, qi: null };
      message = 'Changes discarded.';
    } catch (e) {
      error = e;
    }
  }

  function exportJson() {
    if (!form) return;
    const blob = new Blob([JSON.stringify(pruneAssets($state.snapshot(form) as FormDef), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}-form.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJson(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!looksLikeForm(parsed)) throw new Error('That file is not a Stingr Scout form.');
      pendingImport = { name: file.name, form: { ...parsed, kind, version: 0, assets: parsed.assets ?? {} } };
    } catch (err) {
      error = err instanceof SyntaxError ? new Error('That file is not valid JSON.') : err;
    }
  }
</script>

<h1>{kind === 'match' ? 'Match form' : 'Pit form'}</h1>
<ErrorNote {error} />

{#if form}
  <p class="status" role="status">{statusText}</p>
  <div class="row toolbar">
    <button type="button" onclick={() => (showPreview = !showPreview)}>{showPreview ? 'Hide preview' : 'Show preview'}</button>
    <button type="button" onclick={exportJson}>Export JSON</button>
    <label class="filebtn">Import JSON<input type="file" accept="application/json,.json" hidden aria-label="Import JSON file" onchange={importJson} /></label>
    <button type="button" disabled={!isDraft && status === 'saved'} onclick={() => (confirmDiscard = true)}>Discard changes</button>
    <button type="button" class="primary" disabled={nothingToPublish || problems.length > 0 || status === 'saving' || publishing} onclick={publish}>Publish</button>
    {#if problems.length}
      <span class="problems">
        <span class="error">{problems.length} problem{problems.length === 1 ? '' : 's'}</span>
        <button type="button" class="link" onclick={() => (showProblems = !showProblems)}>{showProblems ? 'Hide problems' : 'Show problems'}</button>
      </span>
    {/if}
  </div>

  {#if message}<p class="banner ok">{message}</p>{/if}
  {#if showProblems && problems.length}
    <div class="banner warn">
      <strong>Fix these before publishing:</strong>
      <ul class="errors">{#each problems as e, i (i)}<li>{e}</li>{/each}</ul>
    </div>
  {/if}
  {#if refused.length}
    <div class="banner warn">
      <strong>The hub didn't publish the form:</strong>
      <ul class="errors">{#each refused as e, i (i)}<li>{e}</li>{/each}</ul>
    </div>
  {/if}
  {#if warnings.length}
    <div class="banner warn"><ul>{#each warnings as w, i (i)}<li>{w}</li>{/each}</ul></div>
  {/if}

  <div class="editor">
    <Outline {form} {selected} onselect={s => (selected = s)} onchange={edit} reserved={lockedKeys} />
    <div>
      {#if selected.qi !== null && form.sections[selected.si]?.questions[selected.qi]}
        <QuestionProps {form} si={selected.si} qi={selected.qi} {lockedKeys} {lockedOptions} onchange={edit} memory={typeMemory} />
      {:else}
        <p class="card muted">Select a question to change it, or add one.</p>
      {/if}
      {#if showPreview}<Preview {form} />{/if}
    </div>
  </div>
{/if}

{#if pendingImport}
  {@const incoming = pendingImport}
  <ConfirmDialog
    title="Replace the draft with “{incoming.name}”?"
    confirmLabel="Replace"
    cancelLabel="Cancel"
    onconfirm={() => { const next = incoming.form; pendingImport = null; edit(next); selected = { si: 0, qi: null }; }}
    oncancel={() => (pendingImport = null)}
  >
    <p>The form you are editing will be replaced by the one in the file. Published versions don't change until you publish.</p>
  </ConfirmDialog>
{/if}

{#if confirmDiscard}
  <ConfirmDialog
    title="Discard unpublished changes?"
    confirmLabel="Discard"
    cancelLabel="Keep editing"
    onconfirm={discard}
    oncancel={() => (confirmDiscard = false)}
  >
    <p>The form will go back to {latest ? `published version ${latest.version}` : 'empty'}.</p>
  </ConfirmDialog>
{/if}
