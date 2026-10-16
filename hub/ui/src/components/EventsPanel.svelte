<script lang="ts">
  import type { Side } from '@stingr/shared';
  import type { Api, EventsView } from '../lib/api';
  import ErrorNote from './ErrorNote.svelte';
  import FieldSide from './FieldSide.svelte';

  let { api, view, onchange }: { api: Api; view: EventsView; onchange: (v: EventsView) => void } = $props();
  let key = $state('');
  let name = $state('');
  let error = $state<unknown>(null);
  const SIDES: [Side, string][] = [['left', 'Red on our left'], ['right', 'Red on our right']];

  async function run(p: Promise<EventsView>): Promise<boolean> {
    error = null;
    try {
      onchange(await p);
      return true;
    } catch (e) {
      error = e;
      return false;
    }
  }

  async function create() {
    const ok = await run(api.createEvent({ key: key.trim().toLowerCase(), ...(name.trim() ? { name: name.trim() } : {}) }));
    if (ok) { key = ''; name = ''; }
  }
</script>

<section class="card">
  <h2>Events</h2>
  {#if view.events.length}
    <ul class="list">
      {#each view.events as ev (ev.key)}
        <li aria-label={ev.name}>
          <span class="grow"><strong>{ev.name}</strong> <span class="muted">({ev.key})</span></span>
          {#if view.current?.key === ev.key}
            <span class="tag">Current</span>
          {:else}
            <button type="button" onclick={() => run(api.setCurrentEvent(ev.key))}>Use this event</button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">No events yet.</p>
  {/if}

  <h3>New event</h3>
  <p class="hint">Use the event's key from The Blue Alliance (for example 2027mokc) so its schedule can be downloaded.</p>
  <div class="row">
    <label>Event key <input aria-label="Event key" value={key} placeholder="2027mokc" oninput={e => (key = e.currentTarget.value)} /></label>
    <label>Event name <input aria-label="Event name" value={name} placeholder="Heartland Regional" oninput={e => (name = e.currentTarget.value)} /></label>
    <button type="button" class="primary" disabled={!key.trim()} onclick={create}>Create event</button>
  </div>

  {#if view.current}
    {@const current = view.current}
    <h3>Field orientation at {current.name}</h3>
    <p class="hint">Sitting in the scouting stands, which side of the field is the Red alliance on? Tablets turn field maps to match.</p>
    <div class="choices" role="group" aria-label="Red alliance side">
      {#each SIDES as [side, label] (side)}
        <button type="button" aria-pressed={(current.redSide ?? 'left') === side} onclick={() => run(api.createEvent({ key: current.key, redSide: side }))}>{label}</button>
      {/each}
    </div>
    <FieldSide redSide={current.redSide ?? 'left'} />
  {/if}
  <ErrorNote {error} />
</section>
