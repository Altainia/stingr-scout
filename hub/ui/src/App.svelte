<script lang="ts">
  import { onMount } from 'svelte';
  import type { Api } from './lib/api';
  import { href, parseRoute, type Route } from './lib/router';
  import Coverage from './pages/Coverage.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import DataPage from './pages/DataPage.svelte';
  import EventSetup from './pages/EventSetup.svelte';
  import FormsEditor from './pages/FormsEditor.svelte';
  import QrScan from './pages/QrScan.svelte';
  import Settings from './pages/Settings.svelte';
  import TeamPage from './pages/TeamPage.svelte';
  import Teams from './pages/Teams.svelte';

  let { api }: { api: Api } = $props();
  let route = $state<Route>(parseRoute(location.hash));

  onMount(() => {
    const onHash = () => { route = parseRoute(location.hash); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  const NAV: { label: string; route: Route }[] = [
    { label: 'Dashboard', route: { page: 'dashboard' } },
    { label: 'Event setup', route: { page: 'event' } },
    { label: 'Match form', route: { page: 'forms', kind: 'match' } },
    { label: 'Pit form', route: { page: 'forms', kind: 'pit' } },
    { label: 'Coverage', route: { page: 'coverage' } },
    { label: 'Teams', route: { page: 'teams' } },
    { label: 'QR scanner', route: { page: 'qr' } },
    { label: 'Export & backup', route: { page: 'data' } },
    { label: 'Settings', route: { page: 'settings' } },
  ];

  function isActive(r: Route): boolean {
    if (r.page === 'forms') return route.page === 'forms' && route.kind === r.kind;
    if (r.page === 'teams') return route.page === 'teams' || route.page === 'team';
    return r.page === route.page;
  }
</script>

<div class="hub">
  <nav class="side" aria-label="Hub">
    <div class="brand">Stingr Scout Hub</div>
    {#each NAV as n (n.label)}
      <a href={href(n.route)} class:active={isActive(n.route)} aria-current={isActive(n.route) ? 'page' : undefined}>{n.label}</a>
    {/each}
  </nav>
  <main>
    {#if route.page === 'dashboard'}
      <Dashboard {api} />
    {:else if route.page === 'event'}
      <EventSetup {api} />
    {:else if route.page === 'forms'}
      {#key route.kind}<FormsEditor {api} kind={route.kind} />{/key}
    {:else if route.page === 'coverage'}
      <Coverage {api} />
    {:else if route.page === 'teams'}
      <Teams {api} />
    {:else if route.page === 'team'}
      {#key route.team}<TeamPage {api} team={route.team} />{/key}
    {:else if route.page === 'qr'}
      <QrScan {api} />
    {:else if route.page === 'data'}
      <DataPage {api} />
    {:else if route.page === 'settings'}
      <Settings {api} />
    {:else}
      <p>Page not found. <a href="#/">Go to the dashboard</a>.</p>
    {/if}
  </main>
</div>
