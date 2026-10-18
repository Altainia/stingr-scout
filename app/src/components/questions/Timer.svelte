<script lang="ts">
  import type { AnswerValue, TimerQuestion } from '@stingr/shared';
  import { onDestroy } from 'svelte';

  let { question, value, onchange }: { question: TimerQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  const round = (s: number) => Math.round(s * 10) / 10;
  let base = $derived(typeof value === 'number' ? value : 0);
  let startedAt = $state<number | null>(null);
  let now = $state(0);
  let editing = $state(false);
  let ticker: ReturnType<typeof setInterval> | null = null;
  let shown = $derived(startedAt === null ? base : base + (now - startedAt) / 1000);

  function start() {
    editing = false; // show the time running
    startedAt = Date.now();
    now = startedAt;
    ticker = setInterval(() => { now = Date.now(); }, 100);
  }

  function stop() {
    if (startedAt === null) return;
    const total = round(base + (Date.now() - startedAt) / 1000);
    startedAt = null;
    if (ticker) clearInterval(ticker);
    ticker = null;
    onchange(total);
  }

  function reset() {
    if (ticker) clearInterval(ticker);
    ticker = null;
    startedAt = null;
    onchange(null);
  }

  // Leaving the section while the timer runs keeps the time counted so far.
  onDestroy(stop);

  /** Finish typing a time: Enter, a change, or leaving the box. */
  function commit(text: string) {
    if (!editing) return; // already finished (for example by Escape)
    editing = false;
    const t = text.trim();
    const next = t === '' ? null : round(Number(t));
    if (next !== (typeof value === 'number' ? value : null)) onchange(next);
  }

  function onKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === 'Enter') commit(e.currentTarget.value);
    else if (e.key === 'Escape') editing = false; // keep the time as it was
  }

  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };
</script>

<div class="timer" role="group" aria-label={question.label}>
  {#if editing}
    <input
      type="number" step="0.1" min="0" aria-label="Seconds" value={base} use:focus
      onchange={e => commit(e.currentTarget.value)} onblur={e => commit(e.currentTarget.value)} onkeydown={onKey}
    />
  {:else}
    <button type="button" class="readout" aria-label="Edit time" onclick={() => { if (startedAt === null) editing = true; }}>{shown.toFixed(1)} s</button>
  {/if}
  {#if startedAt === null}
    <button type="button" class="big" onclick={start}>Start</button>
  {:else}
    <button type="button" class="big" onclick={stop}>Stop</button>
  {/if}
  <button type="button" onclick={reset}>Reset</button>
</div>
