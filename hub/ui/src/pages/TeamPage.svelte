<script lang="ts">
  import { allQuestions, describeAnswer, matchLabel, type Point, type Question, recordPoints, type ScoutRecord, summaryKind } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import FieldScatter from '../components/FieldScatter.svelte';
  import Sparkline from '../components/Sparkline.svelte';
  import type { Api, TeamDetail } from '../lib/api';
  import { num, slotLabel } from '../lib/format';

  let { api, team }: { api: Api; team: number } = $props();
  let detail = $state<TeamDetail | null>(null);
  let error = $state<unknown>(null);
  let history = $state<Record<string, ScoutRecord[]>>({});
  const PIT = { none: 'Not yet', done: 'Done ✓', noshow: 'Not present' } as const;

  onMount(async () => {
    try {
      detail = await api.team(team);
    } catch (e) {
      error = e;
    }
  });

  let form = $derived(detail?.matchForm ?? null);
  let questions = $derived(form ? allQuestions(form) : []);
  let played = $derived((detail?.matchRecords ?? []).filter(r => !r.noShow));
  let trends = $derived(questions.filter(q => summaryKind(q) === 'avg'));
  let texts = $derived(questions.filter(q => q.type === 'text'));
  let maps = $derived(questions.flatMap(q => (q.type === 'fieldmap' ? [q] : [])));
  let comments = $derived(texts.flatMap(q => played.flatMap(r => {
    const v = r.answers[q.key];
    return typeof v === 'string' && v.trim() ? [{ id: `${r.id}-${q.key}`, who: `${matchLabel(r.matchKey ?? '')} (${r.scout})`, text: v }] : [];
  })));
  let pit = $derived((detail?.pitRecords ?? []).filter(r => !r.noShow).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null);

  const cell = (r: ScoutRecord, q: Question) => (r.missed.includes(q.key) ? 'missed' : describeAnswer(q, r.answers[q.key]));
  const numeric = (r: ScoutRecord, key: string) => {
    const v = r.answers[key];
    return typeof v === 'number' && !r.missed.includes(key) ? v : null;
  };

  async function toggleHistory(id: string) {
    if (history[id]) {
      delete history[id];
      return;
    }
    try {
      history[id] = await api.history(id);
    } catch (e) {
      error = e;
    }
  }
</script>

<p><a href="#/teams">‹ All teams</a></p>
<h1>Team {team}</h1>
<ErrorNote {error} />

{#if detail}
  {@const s = detail.summary}
  <section class="card figures">
    <div><strong>{num(s.estPoints)}</strong><div class="muted">est. points per match</div></div>
    <div><strong>{s.matchRecords}</strong><div class="muted">matches scouted</div></div>
    <div><strong>{s.noShows}</strong><div class="muted">no-shows</div></div>
    <div><strong>{PIT[s.pit]}</strong><div class="muted">pit scouting</div></div>
  </section>

  <section class="card">
    <h2>Matches</h2>
    {#if detail.matchRecords.length === 0}
      <p class="muted">No matches scouted yet.</p>
    {:else}
      <div class="scroll-x">
        <table class="grid">
          <thead>
            <tr><th>Match</th><th>Scout</th><th>Points</th>{#each questions as q (q.key)}<th>{q.label}</th>{/each}<th></th></tr>
          </thead>
          <tbody>
            {#each detail.matchRecords as r (r.id)}
              <tr>
                <td>{matchLabel(r.matchKey ?? '')} <span class="muted">{slotLabel(r.slot)}</span></td>
                <td>{r.scout}</td>
                {#if r.noShow}
                  <td colspan={questions.length + 1}><em>Robot not present</em></td>
                {:else}
                  <td>{form ? num(recordPoints(form, r)) : '—'}</td>
                  {#each questions as q (q.key)}<td class:muted={r.missed.includes(q.key)}>{cell(r, q)}</td>{/each}
                {/if}
                <td>
                  {#if r.revision > 1}
                    <button type="button" class="small" onclick={() => toggleHistory(r.id)}>{history[r.id] ? 'Hide history' : `History (${r.revision})`}</button>
                  {/if}
                </td>
              </tr>
              {#if history[r.id]}
                <tr>
                  <td colspan={questions.length + 4}>
                    <ul>
                      {#each history[r.id] as h (h.revision)}
                        <li>Revision {h.revision} · {new Date(h.updatedAt).toLocaleString()} · {h.scout}{#if form && !h.noShow} · {num(recordPoints(form, h))} points{/if}</li>
                      {/each}
                    </ul>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  {#if trends.length && played.length > 1}
    <section class="card">
      <h2>Trends</h2>
      <div class="row">
        {#each trends as q (q.key)}
          <figure><figcaption>{q.label}</figcaption><Sparkline label={q.label} values={played.map(r => numeric(r, q.key))} /></figure>
        {/each}
      </div>
    </section>
  {/if}

  {#if texts.length}
    <section class="card">
      <h2>Comments</h2>
      {#if comments.length}
        <ul>{#each comments as c (c.id)}<li><span class="muted">{c.who}:</span> {c.text}</li>{/each}</ul>
      {:else}
        <p class="muted">No comments.</p>
      {/if}
    </section>
  {/if}

  {#each maps as q (q.key)}
    <section class="card">
      <h2>{q.label}</h2>
      <FieldScatter label={q.label} image={form?.assets[q.assetId]} points={played.flatMap(r => { const v = r.answers[q.key]; return Array.isArray(v) ? (v as Point[]) : []; })} />
    </section>
  {/each}

  <section class="card">
    <h2>Pit scouting</h2>
    {#if pit && detail.pitForm}
      <dl class="pit">
        {#each allQuestions(detail.pitForm) as q (q.key)}
          <dt>{q.label}</dt><dd>{cell(pit, q)}</dd>
        {/each}
      </dl>
      {#if pit.photoIds.length}
        <div class="photos">
          {#each pit.photoIds as id (id)}
            <a href="/api/photos/{id}" target="_blank" rel="noopener"><img src="/api/photos/{id}" alt="Team {team} robot" loading="lazy" /></a>
          {/each}
        </div>
      {/if}
    {:else if s.pit === 'noshow'}
      <p>The team wasn't at its pit.</p>
    {:else}
      <p class="muted">Not pit-scouted yet.</p>
    {/if}
  </section>
{/if}
