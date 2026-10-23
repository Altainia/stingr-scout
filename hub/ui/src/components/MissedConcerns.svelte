<script lang="ts">
  import { matchLabel } from '@stingr/shared';
  import type { MissedRef, MissedReport } from '../lib/api';
  import { slotLabel } from '../lib/format';

  // The lists of missed-answer concerns, each with Acknowledge (or, once acknowledged, Undo).
  let { report, pendingOnly = false, onack, onundo }: {
    report: MissedReport;
    /** only the concerns that still need a look (the Dashboard) */
    pendingOnly?: boolean;
    onack: (id: string) => void;
    onundo?: (id: string) => void;
  } = $props();

  let questions = $derived(report.questions.filter(q => !pendingOnly || !q.acknowledged));
  let scouts = $derived(report.scouts.filter(s => !pendingOnly || !s.acknowledged));
  const pct = (n: number, of: number) => `${of ? Math.round((100 * n) / of) : 0}%`;
  const where = (m: MissedRef) => `${matchLabel(m.matchKey)}${m.slot ? ` · ${slotLabel(m.slot)}` : ''} · Team ${m.team} (${m.scout})`;
</script>

{#snippet actions(id: string, acknowledged: boolean)}
  {#if acknowledged}
    <span class="tag acked">Acknowledged</span>
    {#if onundo}<button type="button" class="link" onclick={() => onundo(id)}>Undo</button>{/if}
  {:else}
    <button type="button" class="small" onclick={() => onack(id)}>Acknowledge</button>
  {/if}
{/snippet}

{#snippet matchList(matches: MissedRef[])}
  {#if matches.length}
    <details>
      <summary>Show the matches</summary>
      <ul class="muted">{#each matches as m, i (i)}<li>{where(m)}</li>{/each}</ul>
    </details>
  {/if}
{/snippet}

{#if questions.length}
  <h3>Questions scouts often miss</h3>
  <p class="hint">It may be hard to see from the stands, or unclear. Consider rewording it or giving it a help text.</p>
  <ul class="missed-list">
    {#each questions as q (q.id)}
      <li class:acknowledged={q.acknowledged}>
        <div class="concern">
          <span class="grow"><strong>{q.label}</strong>: missed in {q.missed} of {q.total} matches ({pct(q.missed, q.total)}), by {q.scouts} of {q.scoutsAsked} scouts</span>
          {@render actions(q.id, q.acknowledged)}
        </div>
        {@render matchList(q.matches)}
      </li>
    {/each}
  </ul>
{/if}
{#if scouts.length}
  <h3>Scouts who miss a question more than others</h3>
  <p class="hint">They may need a pointer on what to watch for, or a different position.</p>
  <ul class="missed-list">
    {#each scouts as s (s.id)}
      <li class:acknowledged={s.acknowledged}>
        <div class="concern">
          <span class="grow"><strong>{s.scout}</strong> misses {s.label} in {s.missed} of {s.total} matches ({pct(s.missed, s.total)}); other scouts {s.othersMissed} of {s.othersTotal} ({pct(s.othersMissed, s.othersTotal)})</span>
          {@render actions(s.id, s.acknowledged)}
        </div>
        {@render matchList(s.matches)}
      </li>
    {/each}
  </ul>
{/if}
