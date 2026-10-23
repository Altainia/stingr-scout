<script lang="ts">
  import { type AllianceField, type AllianceSide, matchLabel } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ConfirmDialog from '../../../../app/src/components/ConfirmDialog.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { AllianceView, Api } from '../lib/api';
  import { onHubChange } from '../lib/changes';
  import { slugify, uniqueKey } from '../lib/formEdit';

  // Alliance results: what can't be put down to one robot (each alliance's score, and this season's alliance fields),
  // typed in here or fetched from The Blue Alliance. They feed each team's estimated share (Teams, team pages).
  let { api }: { api: Api } = $props();
  let view = $state<AllianceView | null>(null);
  let error = $state<unknown>(null);
  let fetching = $state(false);
  let fetched = $state<string | null>(null);
  let newField = $state('');
  let removing = $state<AllianceField | null>(null);
  const SIDES: AllianceSide[] = ['red', 'blue'];

  async function load() {
    try {
      view = await api.alliance();
      error = null;
    } catch (e) {
      error = e;
    }
  }

  onMount(() => {
    void load();
    return onHubChange(load);
  });

  let items = $derived([{ key: 'score', label: 'Score' }, ...(view?.fields ?? [])]);

  async function save(match: string, side: AllianceSide, item: string, text: string) {
    const value = text.trim() === '' ? null : Number(text);
    if (value !== null && !Number.isFinite(value)) return;
    try {
      await api.setAllianceValue(match, side, item, value);
      await load();
    } catch (e) {
      error = e;
    }
  }

  async function saveFields(fields: AllianceField[]) {
    try {
      const saved = await api.setAllianceFields(fields);
      if (view) view = { ...view, fields: saved };
      await load();
    } catch (e) {
      error = e;
    }
  }

  function addField() {
    const label = newField.trim();
    if (!label || !view) return;
    const key = uniqueKey(slugify(label), ['score', ...view.fields.map(f => f.key)]);
    newField = '';
    void saveFields([...view.fields, { key, label }]);
  }

  const update = (key: string, patch: Partial<AllianceField>) =>
    view && saveFields(view.fields.map(f => {
      if (f.key !== key) return f;
      const next = { ...f, ...patch };
      if (!next.tba) delete next.tba;
      return next;
    }));

  async function fetchTba() {
    fetching = true;
    fetched = null;
    try {
      const r = await api.fetchAllianceTba();
      fetched = `Filled ${r.filled} ${r.filled === 1 ? 'value' : 'values'} from ${r.played} played ${r.played === 1 ? 'match' : 'matches'}. Values typed here are kept.`;
      await load();
    } catch (e) {
      error = e;
    } finally {
      fetching = false;
    }
  }
</script>

<h1>Alliance results</h1>
<ErrorNote {error} />
<p class="hint">For scoring that can't be put down to one robot: each alliance's score, and items you add below. From these the hub estimates each team's share (on Teams and team pages).</p>

{#if view}
  <section class="card" aria-labelledby="fields-title">
    <h2 id="fields-title">Alliance fields</h2>
    <p class="hint">Items for this season's game, recorded per alliance. Link one to a The Blue Alliance score-breakdown item to fill it automatically.</p>
    {#if view.fields.length}
      <table class="grid fields-table">
        <thead><tr><th>Field</th><th>Key</th><th>TBA item</th><th></th></tr></thead>
        <tbody>
          {#each view.fields as f (f.key)}
            <tr>
              <td><input aria-label="{f.label}: label" value={f.label} onchange={e => e.currentTarget.value.trim() && update(f.key, { label: e.currentTarget.value.trim() })} /></td>
              <td><code>{f.key}</code></td>
              <td>
                <select aria-label="{f.label}: TBA item" value={f.tba ?? ''} onchange={e => update(f.key, { tba: e.currentTarget.value || undefined })}>
                  <option value="">Not linked</option>
                  {#each [...new Set([...(f.tba ? [f.tba] : []), ...view.tbaItems])].sort() as item (item)}<option value={item}>{item}</option>{/each}
                </select>
              </td>
              <td class="row-actions"><button type="button" class="small danger" aria-label="Remove {f.label}" onclick={() => (removing = f)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !view.tbaItems.length}<p class="hint">Fetch from TBA once to see the items it reports.</p>{/if}
    {/if}
    <div class="row">
      <label>New field <input aria-label="New field" placeholder="e.g. Balls in hopper" value={newField} oninput={e => (newField = e.currentTarget.value)}
        onkeydown={e => { if (e.key === 'Enter') addField(); }} /></label>
      <button type="button" disabled={!newField.trim()} onclick={addField}>Add field</button>
    </div>
  </section>

  <section class="card" aria-labelledby="results-title">
    <h2 id="results-title">Results</h2>
    <div class="row">
      <button type="button" disabled={fetching} onclick={fetchTba}>{fetching ? 'Fetching…' : 'Fetch from TBA'}</button>
      {#if fetched}<span class="banner ok" role="status">{fetched}</span>{/if}
    </div>
    {#if view.matches.length === 0}
      <p class="muted">No schedule yet. <a href="#/event">Import one in Event setup</a>.</p>
    {:else}
      <div class="scroll-x">
        <table class="grid alliance-table">
          <thead><tr><th>Match</th><th>Alliance</th><th>Teams</th>{#each items as it (it.key)}<th>{it.label}</th>{/each}</tr></thead>
          <tbody>
            {#each view.matches as m (m.matchKey)}
              {#each SIDES as side (side)}
                {@const a = m[side]}
                <tr aria-label="{matchLabel(m.matchKey)} {side}" class="side-{side}" class:first={side === 'red'}>
                  {#if side === 'red'}<th rowspan="2" scope="rowgroup">{matchLabel(m.matchKey)}</th>{/if}
                  <td class={side}>{side === 'red' ? 'Red' : 'Blue'}</td>
                  <td>{a.teams.join(' · ') || '—'}</td>
                  {#each items as it (it.key)}
                    {@const v = a.values[it.key]}
                    <td>
                      <span class="with-source">
                        <input type="number" class="narrow" aria-label="{matchLabel(m.matchKey)} {side} {it.label}" value={v?.value ?? ''}
                          onchange={e => save(m.matchKey, side, it.key, e.currentTarget.value)} />
                        {#if v?.source === 'tba'}<span class="tag tba" title="From The Blue Alliance">TBA</span>{/if}
                      </span>
                    </td>
                  {/each}
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{/if}

{#if removing}
  {@const f = removing}
  <ConfirmDialog title="Remove “{f.label}”?" confirmLabel="Remove" cancelLabel="Keep it"
    onconfirm={() => { const key = f.key; removing = null; if (view) void saveFields(view.fields.filter(x => x.key !== key)); }}
    oncancel={() => (removing = null)}>
    <p>Its values in every match will also be removed.</p>
  </ConfirmDialog>
{/if}
