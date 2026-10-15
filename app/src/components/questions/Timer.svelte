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
</script>

<div class="timer" role="group" aria-label={question.label}>
  {#if editing}
    <input
      type="number" step="0.1" min="0" aria-label="Seconds" value={base}
      onchange={e => { const t = e.currentTarget.value; onchange(t === '' ? null : round(Number(t))); editing = false; }}
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
