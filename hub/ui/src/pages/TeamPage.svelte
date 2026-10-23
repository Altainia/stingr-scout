<script lang="ts">
  import TextDialog from '../components/TextDialog.svelte';
  import { allQuestions, describeAnswer, estimatedPoints, matchLabel, type Point, type Question, recordPoints, type ScoutRecord, summaryKind } from '@stingr/shared';
  import { onMount } from 'svelte';
  import { onHubChange } from '../lib/changes';
  import ErrorNote from '../components/ErrorNote.svelte';
  import FieldScatter from '../components/FieldScatter.svelte';
  import CompareChart from '../components/CompareChart.svelte';
  import MatchLineChart from '../components/MatchLineChart.svelte';
  import PointsChart from '../components/PointsChart.svelte';
  import type { Api, TeamDetail } from '../lib/api';
  import { num, slotLabel } from '../lib/format';
  import { type Compared, href, MAX_COMPARED } from '../lib/router';

  let { api, team, vs = [] }: { api: Api; team: number; vs?: Compared[] } = $props();
  // Teams compared with this one (from the address), their details, and names for labels.
  let others = $state<Record<number, TeamDetail>>({});
  let eventTeams = $state<number[]>([]);
  let names = $state<Record<number, string>>({});
  const nameOf = (t: number) => (names[t] ? `${t} ${names[t]}` : String(t));
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

  async function loadOthers() {
    try {
      const got = await Promise.all(vs.map(c => api.team(c.team)));
      others = Object.fromEntries(vs.map((c, i) => [c.team, got[i]]));
    } catch (e) {
      error = e;
    }
  }

  async function loadTeams() {
    try {
      [eventTeams, names] = await Promise.all([api.teams(), api.teamNames()]);
    } catch {
      // the picker just stays empty
    }
  }

  onMount(() => {
    void load();
    void loadTeams();
    return onHubChange(() => { void load(); void loadOthers(); }); // new records synced: refresh
  });
  $effect(() => { void vs.map(c => c.team).join(); void loadOthers(); }); // whenever the comparison changes

  function compareWith(t: number) {
    const free = [2, 3, 4].find(n => !vs.some(c => c.slot === n));
    if (!t || free === undefined) return;
    location.hash = href({ page: 'team', team, vs: [...vs, { team: t, slot: free }] });
  }
  const stopComparing = (t: number) => (location.hash = href({ page: 'team', team, vs: vs.filter(c => c.team !== t) }));
  let comparing = $derived(vs.length > 0 && vs.every(c => others[c.team]));
  let choices = $derived(eventTeams.filter(t => t !== team && !vs.some(c => c.team === t)));

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
  const byMatch = (key: string, records: ScoutRecord[] = detail?.matchRecords ?? []) => records.map(r => {
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
  // Comparing: a line per team, each in the colour it keeps (this team is always the first colour).
  let teamsShown = $derived(detail ? [{ team, slot: 1, d: detail }, ...vs.flatMap(c => (others[c.team] ? [{ team: c.team, slot: c.slot, d: others[c.team] }] : []))] : []);
  const pointsOf = (records: ScoutRecord[]) => records.map(r => {
    const v = form && !r.noShow ? recordPoints(form, r) : null;
    const state = r.noShow ? 'noshow' as const : v === null ? 'missed' as const : 'ok' as const;
    return { label: matchLabel(r.matchKey ?? ''), scout: r.scout, state, value: v };
  });
  let pointsSeries = $derived(teamsShown.map(t => ({ id: String(t.team), name: nameOf(t.team), slot: t.slot, matches: pointsOf(t.d.matchRecords) })));
  const questionSeries = (key: string) => teamsShown.map(t => ({ id: String(t.team), name: nameOf(t.team), slot: t.slot, matches: byMatch(key, t.d.matchRecords) }));
  const avgOf = (key: string, records: ScoutRecord[]) => {
    const nums = records.flatMap(r => (!r.noShow && !r.missed.includes(key) && typeof r.answers[key] === 'number' ? [r.answers[key] as number] : []));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
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

  {#if detail.allianceShares?.some(a => a.results > 0)}
    <section class="card" aria-labelledby="estimates-title">
      <h2 id="estimates-title">Estimated from alliance results</h2>
      <p class="hint">This team's share of each alliance total, worked out from every alliance it was on (OPR).</p>
      <div class="figures">
        {#each detail.allianceShares as a (a.item)}
          <div>
            {#if a.value !== null}
              <strong>{num(a.value)}</strong><div class="muted">{a.label} <span class="hint">· {a.results} alliances</span></div>
            {:else}
              <strong>—</strong><div class="muted">{a.label} <span class="hint">· needs 3 alliance results, has {a.results}</span></div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="card compare">
    <h2>Compare</h2>
    <div class="row compare-row">
      {#each vs as c (c.team)}
        <span class="compare-chip"><span class="line-key" style:background="var(--chart-{c.slot})"></span>{nameOf(c.team)}
          <button type="button" class="small" aria-label="Stop comparing with {c.team}" onclick={() => stopComparing(c.team)}>✕</button></span>
      {/each}
      {#if vs.length < MAX_COMPARED}
        <label class="compact">Compare with
          <select aria-label="Compare with" value="" onchange={e => compareWith(Number(e.currentTarget.value))}>
            <option value="">Choose a team…</option>
            {#each choices as t (t)}<option value={t}>{nameOf(t)}</option>{/each}
          </select>
        </label>
      {:else}
        <span class="hint">You can compare up to {MAX_COMPARED} teams at a time.</span>
      {/if}
    </div>
    {#if comparing && form}
      <div class="scroll-x">
        <table class="grid" aria-label="Teams side by side">
          <thead><tr><th>Team</th><th>Matches</th><th>Est. points</th>{#each numericQs as q (q.key)}<th>{q.label}</th>{/each}</tr></thead>
          <tbody>
            {#each teamsShown as t (t.team)}
              <tr>
                <td><span class="line-key" style:background="var(--chart-{t.slot})"></span> {nameOf(t.team)}</td>
                <td>{t.d.summary.matchRecords}</td>
                <td>{num(t.d.summary.estPoints)}</td>
                {#each numericQs as q (q.key)}<td>{num(avgOf(q.key, t.d.matchRecords))}</td>{/each}
              </tr>
            {/each}
            <tr class="muted">
              <td>Event average</td><td></td><td>{num(detail.eventAverages?.points.total ?? null)}</td>
              {#each numericQs as q (q.key)}<td>{num(detail.eventAverages?.questions[q.key] ?? null)}</td>{/each}
            </tr>
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  {#if form && comparing}
    {#if scores}
      <section class="card points-chart">
        <h2>Points per match</h2>
        <CompareChart title="Points per match" wide series={pointsSeries} eventAverage={detail.eventAverages?.points.total ?? null} />
      </section>
    {/if}
    {#if numericQs.length}
      <section class="card">
        <h2>By match</h2>
        <p class="hint">Each team's matches in order. ⚠ missed · ✗ robot not there · – no answer</p>
        <ul class="chart-legend" aria-label="Teams in these charts">
          {#each teamsShown as t (t.team)}<li><span class="line-key" style:background="var(--chart-{t.slot})"></span>{nameOf(t.team)}</li>{/each}
          <li><span class="ref-key"></span>Event average</li>
        </ul>
        <div class="charts">
          {#each numericQs as q (q.key)}
            <figure>
              <figcaption>{q.label}</figcaption>
              <CompareChart title={q.label} legend={false} series={questionSeries(q.key)} eventAverage={detail.eventAverages?.questions[q.key] ?? null} />
            </figure>
          {/each}
        </div>
      </section>
    {/if}
  {:else if form && detail.matchRecords.length}
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
