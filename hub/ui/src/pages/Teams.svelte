<script lang="ts">
  import { allQuestions, type ChoiceQuestion, type FormDef, summaryKind } from '@stingr/shared';
  import { onMount } from 'svelte';
  import { onHubChange } from '../lib/changes';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { Api, TeamSummary } from '../lib/api';
  import { num, pct } from '../lib/format';
  import { sortBy } from '../lib/sort';

  let { api }: { api: Api } = $props();
  type Col = { id: string; label: string; get: (s: TeamSummary) => number | string | null; show: (s: TeamSummary) => string };

  let data = $state<{ form: FormDef | null; summaries: TeamSummary[]; scoreShares?: Record<number, number | null> } | null>(null);
  let error = $state<unknown>(null);
  let sortId = $state('est');
  let dir = $state<'asc' | 'desc'>('desc');
  const PIT = { none: '—', done: '✓', noshow: 'Not present' } as const;

  async function load() {
    try {
      data = await api.summaries();
      error = null;
    } catch (e) {
      error = e;
    }
  }

  onMount(() => {
    void load();
    return onHubChange(load); // new records synced: refresh
  });

  function topOption(s: TeamSummary, q: ChoiceQuestion): { label: string; share: number } | null {
    const st = s.stats[q.key];
    if (st?.kind !== 'distribution' || !st.n) return null;
    const best = Object.entries(st.counts).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    return { label: q.options.find(o => o.value === best[0])?.label ?? best[0], share: best[1] / st.n };
  }

  let cols = $derived.by((): Col[] => {
    const list: Col[] = [
      { id: 'team', label: 'Team', get: s => s.team, show: s => String(s.team) },
      { id: 'matches', label: 'Matches', get: s => s.matchRecords, show: s => String(s.matchRecords) },
      { id: 'noshow', label: 'No-shows', get: s => s.noShowPct, show: s => pct(s.noShowPct) },
      { id: 'est', label: 'Est. points', get: s => s.estPoints, show: s => num(s.estPoints) },
    ];
    // Each team's estimated share of the alliance score (from Alliance results), once any are recorded.
    const shares = data?.scoreShares;
    if (shares && Object.values(shares).some(v => v !== null)) {
      list.push({ id: 'score_share', label: 'Score share', get: s => shares[s.team] ?? null, show: s => num(shares[s.team] ?? null) });
    }
    const form = data?.form;
    if (form) {
      for (const sec of form.sections) {
        const scores = sec.questions.some(q =>
          ((q.type === 'counter' || q.type === 'toggle') && q.points !== undefined) || (q.type === 'choice' && q.options.some(o => o.points !== undefined)));
        if (scores) list.push({ id: `sec_${sec.id}`, label: `${sec.title} pts`, get: s => s.estPointsBySection[sec.id] ?? null, show: s => num(s.estPointsBySection[sec.id]) });
      }
      for (const q of allQuestions(form)) {
        const kind = summaryKind(q);
        if (kind === 'avg') {
          list.push({
            id: q.key, label: q.label,
            get: s => { const st = s.stats[q.key]; return st?.kind === 'avg' ? st.avg : null; },
            show: s => { const st = s.stats[q.key]; return st?.kind === 'avg' ? num(st.avg) : '—'; },
          });
        } else if (kind === 'pct') {
          list.push({
            id: q.key, label: q.label,
            get: s => { const st = s.stats[q.key]; return st?.kind === 'pct' ? st.pct : null; },
            show: s => { const st = s.stats[q.key]; return st?.kind === 'pct' ? pct(st.pct) : '—'; },
          });
        } else if (kind === 'distribution' && q.type === 'choice') {
          list.push({
            id: q.key, label: q.label,
            get: s => topOption(s, q)?.share ?? null,
            show: s => { const t = topOption(s, q); return t ? `${t.label} ${pct(t.share)}` : '—'; },
          });
        }
      }
    }
    list.push({ id: 'pit', label: 'Pit', get: s => s.pit, show: s => PIT[s.pit] });
    return list;
  });

  let rows = $derived(data ? sortBy(data.summaries, (cols.find(c => c.id === sortId) ?? cols[0]).get, dir) : []);

  function sortOn(c: Col) {
    if (sortId === c.id) dir = dir === 'asc' ? 'desc' : 'asc';
    else {
      sortId = c.id;
      dir = c.id === 'team' || c.id === 'pit' ? 'asc' : 'desc';
    }
  }
</script>

<h1>Teams</h1>
<ErrorNote {error} />

{#if data}
  {#if !data.form}<p class="banner warn">No match form is published yet, so there is nothing to summarize.</p>{/if}
  <p class="muted">Est. points is the average a team scores per match, using the point values in the match form. Missed answers and no-shows are left out. Click a column to sort.</p>
  <div class="scroll-x">
    <table class="grid">
      <thead>
        <tr>
          {#each cols as c (c.id)}
            <th aria-sort={sortId === c.id ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" class="sort" onclick={() => sortOn(c)}>{c.label}{sortId === c.id ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as s (s.team)}
          <tr>
            {#each cols as c (c.id)}
              <td>{#if c.id === 'team'}<a href="#/teams/{s.team}">{s.team}</a>{:else}{c.show(s)}{/if}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
