<script lang="ts">
  import TextDialog from '../components/TextDialog.svelte';
  import { allQuestions, describeAnswer, estimatedPoints, matchLabel, type Point, type Question, recordPoints, type ScoutRecord, summaryKind } from '@stingr/shared';
  import { onMount } from 'svelte';
  import { onHubChange } from '../lib/changes';
  import ErrorNote from '../components/ErrorNote.svelte';
  import FieldScatter from '../components/FieldScatter.svelte';
  import MatchLineChart from '../components/MatchLineChart.svelte';
  import PointsChart from '../components/PointsChart.svelte';
  import type { Api, TeamDetail } from '../lib/api';
  import { num, slotLabel } from '../lib/format';

  let { api, team }: { api: Api; team: number } = $props();
  let detail = $state<TeamDetail | null>(null);
  let error = $state<unknown>(null);
  let history = $state<Record<string, ScoutRecord[]>>({});
  const PIT = { none: 'Not yet', done: 'Done ✓', noshow: 'Not present' } as const;

  async function load() {
    try {
      detail = await api.team(team);
      error = null;
    } catch (e) {
      error = e;
    }
  }

  onMount(() => {
    void load();
    return onHubChange(load); // new records synced: refresh
  });

  let form = $derived(detail?.matchForm ?? null);
  let questions = $derived(form ? allQuestions(form) : []);
  let played = $derived((detail?.matchRecords ?? []).filter(r => !r.noShow));
  // Charts: points per match, and each numeric question by match, beside the event's averages.
  let numericQs = $derived(questions.filter(q => q.type === 'counter' || q.type === 'number' || q.type === 'rating' || q.type === 'timer'));
  let scores = $derived(form ? form.sections.some(s => s.questions.some(q =>
    ((q.type === 'counter' || q.type === 'toggle') && q.points !== undefined) || (q.type === 'choice' && q.options.some(o => o.points !== undefined)))) : false);
  let pointsData = $derived(form ? (detail?.matchRecords ?? []).map(r => {
    const by = r.noShow ? null : estimatedPoints(form, [r]).bySection;
    const sections = form.sections.map(s => by?.[s.id] ?? null);
    const state = r.noShow ? 'noshow' as const : sections.every(v => v === null) ? 'missed' as const : 'ok' as const;
    return { label: matchLabel(r.matchKey ?? ''), scout: r.scout, state, sections };
  }) : []);
  const byMatch = (key: string) => (detail?.matchRecords ?? []).map(r => {
    const v = r.answers[key];
    const state = r.noShow ? 'noshow' as const : r.missed.includes(key) ? 'missed' as const : typeof v === 'number' ? 'ok' as const : 'blank' as const;
    return { label: matchLabel(r.matchKey ?? ''), scout: r.scout, state, value: state === 'ok' ? (v as number) : null };
  });
  let texts = $derived(questions.filter(q => q.type === 'text' && summaryKind(q) === 'list')); // "Don't summarize" leaves them out of Comments
  // Long text answers are shortened in the match table; the full text opens in a popup.
  const PREVIEW = 24;
  let reading = $state<{ title: string; text: string } | null>(null);
  function preview(text: string): string | null {
    if (text.length <= PREVIEW) return null;
    const cut = text.slice(0, PREVIEW);
    const space = cut.lastIndexOf(' ');
    return `${(space > PREVIEW / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
  }
  let maps = $derived(questions.flatMap(q => (q.type === 'fieldmap' ? [q] : [])));
  let comments = $derived(texts.flatMap(q => played.flatMap(r => {
    const v = r.answers[q.key];
    return typeof v === 'string' && v.trim() ? [{ id: `${r.id}-${q.key}`, who: `${matchLabel(r.matchKey ?? '')} (${r.scout})`, text: v }] : [];
  })));
  let pit = $derived((detail?.pitRecords ?? []).filter(r => !r.noShow).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null);

  const cell = (r: ScoutRecord, q: Question) => (r.missed.includes(q.key) ? 'missed' : describeAnswer(q, r.answers[q.key]));

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

  {#if form && detail.matchRecords.length}
    {#if scores}
      <section class="card points-chart">
        <h2>Points per match</h2>
        <PointsChart matches={pointsData} sections={form.sections.map(s => ({ id: s.id, title: s.title }))} eventAverage={detail.eventAverages?.points.total ?? null} />
      </section>
    {/if}
    {#if numericQs.length}
      <section class="card">
        <h2>By match</h2>
        <p class="hint">The dashed line is the average across every team at this event. ⚠ missed · ✗ robot not there · – no answer</p>
        <div class="charts">
          {#each numericQs as q (q.key)}
            <figure>
              <figcaption>{q.label}</figcaption>
              <MatchLineChart title={q.label} matches={byMatch(q.key)} eventAverage={detail.eventAverages?.questions[q.key] ?? null} />
            </figure>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

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
                  {#each questions as q (q.key)}
                    {@const text = cell(r, q)}
                    {@const short = q.type === 'text' && !r.missed.includes(q.key) ? preview(text) : null}
                    <td class:muted={r.missed.includes(q.key)} class:text-cell={q.type === 'text'}>
                      {#if short}
                        <button type="button" class="link peek" title="Show the full text"
                          onclick={() => (reading = { title: `${q.label} · ${matchLabel(r.matchKey ?? '')} (${r.scout})`, text })}>{short}</button>
                      {:else}{text}{/if}
                    </td>
                  {/each}
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

{#if reading}
  <TextDialog title={reading.title} text={reading.text} onclose={() => (reading = null)} />
{/if}
