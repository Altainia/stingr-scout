<script lang="ts">
  import { onMount } from 'svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import MissedConcerns from '../components/MissedConcerns.svelte';
  import { type Api, type DevicesView, type EventsView, MISSED_CHANGED, type MissedReport, needsLook } from '../lib/api';
  import { ago } from '../lib/format';

  let { api }: { api: Api } = $props();
  let devices = $state<DevicesView | null>(null);
  let events = $state<EventsView | null>(null);
  let error = $state<unknown>(null);
  let now = $state(Date.now());
  let missed = $state<MissedReport | null>(null);
  let pending = $derived(missed ? needsLook(missed) : 0);

  async function refresh() {
    try {
      const [d, e] = await Promise.all([api.devices(), api.events()]);
      devices = d;
      events = e;
      now = Date.now();
      error = null;
      missed = await api.missed().catch(() => null); // none without a current event
    } catch (e) {
      error = e;
    }
  }

  onMount(() => {
    void refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  });

  function usbState(state: string, reversed: boolean, problem?: string): string {
    if (state === 'device') return reversed ? 'Connected ✓' : `Connected, but the hub couldn't link to it${problem ? `: ${problem}` : ''}`;
    if (state === 'unauthorized') return 'Accept the "Allow USB debugging" prompt on the tablet';
    if (state === 'offline') return 'Not responding. Unplug it and plug it back in.';
    return state;
  }
</script>

<h1>Dashboard</h1>
<ErrorNote {error} />

{#if missed && pending > 0}
  <section class="card needs-look" aria-labelledby="needs-look-title">
    <h2 id="needs-look-title">Needs a look ({pending})</h2>
    <p class="hint">Patterns in missed answers. Acknowledge one once you've dealt with it; it comes back if it keeps getting worse.</p>
    <MissedConcerns report={missed} pendingOnly onack={async id => {
      try { missed = await api.ackMissed(id); window.dispatchEvent(new Event(MISSED_CHANGED)); } catch (e) { error = e; }
    }} />
    <p><a href="#/coverage">See all on Coverage ›</a></p>
  </section>
{/if}

<section class="card">
  <h2>Event</h2>
  {#if events?.current}
    <p><strong>{events.current.name}</strong> <span class="muted">({events.current.key})</span></p>
  {:else if events}
    <p>No event yet. <a href="#/event">Set one up</a>.</p>
  {/if}
</section>

<section class="card">
  <h2>Plugged-in tablets</h2>
  {#if devices && !devices.adb.available}
    <p class="banner warn">{devices.adb.error}</p>
  {:else if devices && devices.adb.devices.length === 0}
    <p class="muted">No tablets plugged in.</p>
  {:else if devices}
    <ul class="list">
      {#each devices.adb.devices as d (d.serial)}
        <li><strong>{d.serial}</strong><span class="grow">{usbState(d.state, d.reversed, d.error)}</span></li>
      {/each}
    </ul>
  {/if}
</section>

<section class="card">
  <h2>Tablets that have synced</h2>
  {#if devices && devices.devices.length}
    <table class="grid">
      <thead><tr><th>Tablet</th><th>Last sync</th></tr></thead>
      <tbody>
        {#each devices.devices as d (d.id)}
          <tr><td>{d.name || '(unnamed)'}</td><td>{d.lastSyncAt ? ago(d.lastSyncAt, now) : 'never'}</td></tr>
        {/each}
      </tbody>
    </table>
  {:else if devices}
    <p class="muted">No tablet has synced yet.</p>
  {/if}
</section>
