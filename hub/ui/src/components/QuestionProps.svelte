<script lang="ts">
  import {
    type ChoiceOption, type ChoiceQuestion, DIM_PART_LABELS, DIM_PARTS, type FormDef, type Question, type QuestionType, SUMMARY_NAMES, summaryKind, summaryOptions,
    type SummaryKind,
  } from '@stingr/shared';
  import InfoTip from './InfoTip.svelte';
  import {
    addOption, changeType, moveOption, QUESTION_TYPES, removeOption, renameOption, renameQuestion, replaceQuestion,
    setFieldImage, setOptionPoints, setOptionValue, typeLabel,
  } from '../lib/formEdit';

  let { form, si, qi, lockedKeys, lockedOptions, onchange, memory = new Map() }: {
    form: FormDef;
    si: number;
    qi: number;
    lockedKeys: Set<string>;
    lockedOptions: Map<string, Set<string>>;
    onchange: (f: FormDef) => void;
    /** Each question's settings for the types it has been, so switching back brings them back (question key → type → settings). */
    memory?: Map<string, Partial<Record<QuestionType, Question>>>;
  } = $props();

  let q = $derived(form.sections[si].questions[qi]);
  let locked = $derived(lockedKeys.has(q.key));
  let imageError = $state<string | null>(null);
  // Only the summaries that work for this type are offered; the default one is the "Default (…)" choice.
  let summaries = $derived(summaryOptions(q.type));
  let defaultSummary = $derived(summaryKind({ ...q, summary: undefined } as Question));
  let summaryValue = $derived(q.summary === undefined || q.summary === defaultSummary ? '' : q.summary);
  let summaryMisfit = $derived(q.summary !== undefined && !summaries.includes(q.summary));

  // What each summary shows, for the Summary info popup.
  const SUMMARY_HELP: Record<SummaryKind, string> = {
    avg: 'The average and the highest value.',
    pct: 'How often the answer was Yes.',
    distribution: 'The share of matches each option was chosen.',
    list: "Every answer, listed on the team's page.",
    scatter: 'Every marked spot, drawn on the field image.',
    size: 'Each measurement in feet and inches (on Teams, from the newest pit record).',
    none: 'Answers are kept and exported, but not summarized.',
  };

  function switchType(type: QuestionType) {
    const saved = memory.get(q.key) ?? {};
    saved[q.type] = q;
    memory.set(q.key, saved);
    put(changeType(q, type, saved[type]));
  }

  function put(next: Question) {
    onchange(replaceQuestion(form, si, qi, next));
  }
  function set(patch: Record<string, unknown>) {
    const next = { ...q, ...patch } as Record<string, unknown>;
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
    put(next as unknown as Question);
  }
  const optNum = (s: string): number | undefined => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));
  const reqNum = (s: string, fallback: number): number => optNum(s) ?? fallback;

  function readAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function pickImage(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    imageError = null;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      imageError = 'Use a smaller image (under 2 MB).';
      return;
    }
    onchange(setFieldImage(form, si, qi, await readAsDataUrl(file)));
  }
</script>

{#snippet clear(name: string, value: unknown, key: string)}
  <button type="button" class="small" aria-label="Clear {name}" title="Clear" disabled={value === undefined} onclick={() => set({ [key]: undefined })}>✕</button>
{/snippet}

<section class="card" aria-label="Question settings">
  <h2>Question</h2>
  <div class="row">
    <label>Label <input aria-label="Label" value={q.label} oninput={e => put(renameQuestion(form, q, e.currentTarget.value, locked, lockedKeys))} /></label>
    <label>Type
      <select aria-label="Type" value={q.type} onchange={e => switchType(e.currentTarget.value as QuestionType)}>
        {#each QUESTION_TYPES as t (t.type)}<option value={t.type}>{t.label}</option>{/each}
      </select>
    </label>
    <div class="field">
      <span class="caption">Key
        <InfoTip label="About Key">
          <p>The key is the name this question's answers are saved under, and its column name in exports: lowercase letters, digits and _.</p>
          <p>It follows the label until the form is published. After that it can't change, because collected answers use it.</p>
        </InfoTip>
      </span>
      <input aria-label="Key" value={q.key} disabled={locked} oninput={e => set({ key: e.currentTarget.value })} />
    </div>
  </div>
  {#if locked}<p class="hint">The key is in published data, so it can't change.</p>{/if}
  <label>Help text <input aria-label="Help text" value={q.help ?? ''} oninput={e => set({ help: e.currentTarget.value || undefined })} /></label>
  <div class="row">
    <div class="field">
      <span class="caption">Required</span>
      <label class="inline"><input type="checkbox" aria-label="Required" checked={q.required} onchange={e => set({ required: e.currentTarget.checked })} /> Scouts must answer</label>
    </div>
    <div class="field">
      <span class="caption">Summary
        <InfoTip label="About Summary">
          <p>How this question's answers are summarized for each team, on the Teams page, each team's page and in the team summary export.</p>
          <dl>
            {#each summaries as kind (kind)}<dt>{SUMMARY_NAMES[kind]}</dt><dd>{SUMMARY_HELP[kind]}</dd>{/each}
          </dl>
          <p>For this {typeLabel(q.type)} question, the default is {SUMMARY_NAMES[defaultSummary]}.</p>
        </InfoTip>
      </span>
      <select aria-label="Summary" value={summaryValue} onchange={e => set({ summary: e.currentTarget.value || undefined })}>
        <option value="">Default ({SUMMARY_NAMES[defaultSummary]})</option>
        {#each summaries.filter(k => k !== defaultSummary) as kind (kind)}<option value={kind}>{SUMMARY_NAMES[kind]}</option>{/each}
        {#if summaryMisfit && q.summary}<option value={q.summary}>{SUMMARY_NAMES[q.summary]} (doesn't work for this type)</option>{/if}
      </select>
    </div>
  </div>

  <!-- Settings only this type of question has, set apart from those every question has. -->
  <div class="type-settings" role="group" aria-labelledby="type-settings-title">
    <h3 id="type-settings-title">{typeLabel(q.type)} settings</h3>
    {#if q.type === 'counter'}
      <div class="fields">
        <label class="compact">Min <input aria-label="Min" type="number" value={q.min} oninput={e => set({ min: reqNum(e.currentTarget.value, 0) })} /></label>
        <label class="compact">Max <input aria-label="Max" type="number" placeholder="none" value={q.max ?? ''} oninput={e => set({ max: optNum(e.currentTarget.value) })} /></label>
        {@render clear('Max', q.max, 'max')}
        <label class="compact">Step <input aria-label="Step" type="number" min="1" value={q.step} oninput={e => set({ step: reqNum(e.currentTarget.value, 1) })} /></label>
        <label class="compact">Default <input aria-label="Default" type="number" value={q.default} oninput={e => set({ default: reqNum(e.currentTarget.value, 0) })} /></label>
        <label class="compact">Points each <input aria-label="Points each" type="number" placeholder="none" value={q.points ?? ''} oninput={e => set({ points: optNum(e.currentTarget.value) })} /></label>
        {@render clear('Points each', q.points, 'points')}
      </div>
    {:else if q.type === 'toggle'}
      <div class="fields">
        <label class="compact">Default
          <select aria-label="Default" value={q.default === undefined ? '' : q.default ? 'yes' : 'no'}
            onchange={e => set({ default: e.currentTarget.value === '' ? undefined : e.currentTarget.value === 'yes' })}>
            <option value="">No default</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </label>
        <label class="compact">Points for yes <input aria-label="Points for yes" type="number" placeholder="none" value={q.points ?? ''} oninput={e => set({ points: optNum(e.currentTarget.value) })} /></label>
        {@render clear('Points for yes', q.points, 'points')}
      </div>
    {:else if q.type === 'choice' || q.type === 'multi'}
      {@const opts = q}
      {#if opts.type === 'choice'}
        <div class="fields">
          <label class="compact">Show as
            <select aria-label="Show as" value={opts.display} onchange={e => set({ display: e.currentTarget.value })}>
              <option value="buttons">Buttons</option><option value="dropdown">Dropdown</option>
            </select>
          </label>
          <label class="compact">Default
            <select aria-label="Default" value={opts.default ?? ''} onchange={e => set({ default: e.currentTarget.value || undefined })}>
              <option value="">No default</option>
              {#each opts.options as o, i (i)}<option value={o.value}>{o.label}</option>{/each}
            </select>
          </label>
        </div>
      {/if}
      <table class="grid">
        <thead><tr><th>Option</th><th>Value</th>{#if opts.type === 'choice'}<th>Points</th>{/if}<th></th></tr></thead>
        <tbody>
          {#each opts.options as o, i (i)}
            {@const optLocked = lockedOptions.get(opts.key)?.has(o.value) ?? false}
            <tr>
              <td><input aria-label="Option {i + 1}" value={o.label} oninput={e => put(renameOption(opts, i, e.currentTarget.value, optLocked))} /></td>
              <td><input aria-label="Option {i + 1} value" value={o.value} disabled={optLocked} oninput={e => put(setOptionValue(opts, i, e.currentTarget.value))} /></td>
              {#if opts.type === 'choice'}
                <td><span class="with-clear"><input class="narrow" aria-label="Option {i + 1} points" type="number" placeholder="none" value={(o as ChoiceOption).points ?? ''}
                  oninput={e => put(setOptionPoints(opts as ChoiceQuestion, i, optNum(e.currentTarget.value)))} />
                  <button type="button" class="small" aria-label="Clear option {i + 1} points" title="Clear" disabled={(o as ChoiceOption).points === undefined}
                    onclick={() => put(setOptionPoints(opts as ChoiceQuestion, i, undefined))}>✕</button></span></td>
              {/if}
              <td class="row-actions">
                <button type="button" class="small" aria-label="Move option {i + 1} up" onclick={() => put(moveOption(opts, i, -1))}>↑</button>
                <button type="button" class="small" aria-label="Move option {i + 1} down" onclick={() => put(moveOption(opts, i, 1))}>↓</button>
                <button type="button" class="small danger" aria-label="Remove option {i + 1}" onclick={() => put(removeOption(opts, i))}>✕</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button type="button" onclick={() => put(addOption(opts))}>Add option</button>
    {:else if q.type === 'number'}
      <label class="inline"><input type="checkbox" aria-label="Whole numbers only" checked={q.integer} onchange={e => set({ integer: e.currentTarget.checked })} /> Whole numbers only</label>
      <div class="fields">
        <label class="compact">Min <input aria-label="Min" type="number" placeholder="none" value={q.min ?? ''} oninput={e => set({ min: optNum(e.currentTarget.value) })} /></label>
        {@render clear('Min', q.min, 'min')}
        <label class="compact">Max <input aria-label="Max" type="number" placeholder="none" value={q.max ?? ''} oninput={e => set({ max: optNum(e.currentTarget.value) })} /></label>
        {@render clear('Max', q.max, 'max')}
        <label class="compact">Default <input aria-label="Default" type="number" placeholder="none" value={q.default ?? ''} oninput={e => set({ default: optNum(e.currentTarget.value) })} /></label>
        {@render clear('Default', q.default, 'default')}
      </div>
    {:else if q.type === 'text'}
      <label class="inline"><input type="checkbox" aria-label="Several lines" checked={q.multiline} onchange={e => set({ multiline: e.currentTarget.checked })} /> Several lines</label>
    {:else if q.type === 'rating'}
      <div class="fields">
        <label class="compact">Highest rating <input aria-label="Highest rating" type="number" min="2" max="10" value={q.max} oninput={e => set({ max: reqNum(e.currentTarget.value, 5) })} /></label>
        <label class="compact">Default
          <select aria-label="Default" value={q.default === undefined ? '' : String(q.default)} onchange={e => set({ default: optNum(e.currentTarget.value) })}>
            <option value="">No default</option>
            {#each Array.from({ length: Number.isInteger(q.max) && q.max > 0 ? Math.min(q.max, 10) : 0 }, (_, i) => i + 1) as n (n)}<option value={String(n)}>{n}</option>{/each}
          </select>
        </label>
      </div>
    {:else if q.type === 'dimensions'}
      {@const parts = q.parts}
      <div class="choices" role="group" aria-label="Measurements">
        {#each DIM_PARTS as p (p)}
          <label class="inline"><input type="checkbox" aria-label={DIM_PART_LABELS[p]} checked={parts.includes(p)}
            onchange={e => set({ parts: DIM_PARTS.filter(x => (x === p ? e.currentTarget.checked : parts.includes(x))) })} /> {DIM_PART_LABELS[p]}</label>
        {/each}
      </div>
      <p class="hint">Scouts enter each one in feet and inches; it's saved in inches.</p>
    {:else if q.type === 'timer'}
      <p class="hint">Scouts start and stop a stopwatch; the total time is saved in seconds.</p>
    {:else if q.type === 'fieldmap'}
      {#if form.assets[q.assetId]}
        <img class="thumb" src={form.assets[q.assetId]} alt="Field" />
      {:else}
        <p class="hint">No field image yet.</p>
      {/if}
      <label class="filebtn">Choose field image<input type="file" accept="image/*" hidden aria-label="Field image file" onchange={pickImage} /></label>
      {#if imageError}<p class="error">{imageError}</p>{/if}
      <div class="fields">
        <label class="compact">Points to mark <input aria-label="Points to mark" type="number" min="1" value={q.maxPoints} oninput={e => set({ maxPoints: reqNum(e.currentTarget.value, 1) })} /></label>
      </div>
      <div class="choices" role="group" aria-label="Red side of this image">
        <button type="button" aria-pressed={q.redSide === 'left'} onclick={() => set({ redSide: 'left' })}>Red on the left</button>
        <button type="button" aria-pressed={q.redSide === 'right'} onclick={() => set({ redSide: 'right' })}>Red on the right</button>
      </div>
    {/if}
  </div>
</section>
