<script lang="ts">
  import { onMount } from 'svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import EventsPanel from '../components/EventsPanel.svelte';
  import SchedulePanel from '../components/SchedulePanel.svelte';
  import TeamsPanel from '../components/TeamsPanel.svelte';
  import type { Api, EventsView } from '../lib/api';

  let { api }: { api: Api } = $props();
  let view = $state<EventsView | null>(null);
  let error = $state<unknown>(null);
  let teamsVersion = $state(0); // bumped when a schedule change may have added teams

  onMount(async () => {
    try {
      view = await api.events();
    } catch (e) {
      error = e;
    }
  });
</script>

<h1>Event setup</h1>
<ErrorNote {error} />
{#if view}
  <EventsPanel {api} {view} onchange={v => (view = v)} />
  {#if view.current}
    {#key view.current.key}
      <SchedulePanel {api} onchanged={() => teamsVersion++} />
      {#key teamsVersion}<TeamsPanel {api} />{/key}
    {/key}
  {/if}
{/if}
