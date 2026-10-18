import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';
import type { SyncView } from '../src/lib/syncController';
import { makeStore } from './helpers';

function fakeSync() {
  const listeners = new Set<(v: SyncView) => void>();
  let view: SyncView = { phase: 'offline', progress: { done: 0, total: 0 }, error: null, overlay: false, hubBuild: null };
  return {
    get view() { return view; },
    subscribe(fn: (v: SyncView) => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    retry: vi.fn(async () => {}),
    dismiss: vi.fn(),
    emit(patch: Partial<SyncView>) {
      view = { ...view, ...patch };
      for (const l of listeners) l(view);
    },
  };
}

describe('App', () => {
  it('shows the home screen with the event and sync status', async () => {
    const { store } = await makeStore();
    render(App, { store, sync: fakeSync() });
    expect(screen.getByText('Test Event')).toBeTruthy();
    expect(screen.getByText('All synced ✓')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start scouting' })).toBeTruthy();
  });

  it('offers Settings in the top bar on the main page', async () => {
    const { store } = await makeStore();
    render(App, { store, sync: fakeSync() });
    await fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  });

  it('counts records waiting to sync', async () => {
    const { store } = await makeStore();
    await store.matchNoShow({ matchKey: 'qm1', slot: 'red1', team: 5098 });
    render(App, { store, sync: fakeSync() });
    expect(screen.getByText('1 unsynced')).toBeTruthy();
  });

  it('offers "Sync now" while connected with records waiting', async () => {
    const { store } = await makeStore();
    await store.matchNoShow({ matchKey: 'qm1', slot: 'red1', team: 5098 });
    const sync = fakeSync();
    render(App, { store, sync });
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull(); // not connected
    sync.emit({ phase: 'error', overlay: false, error: 'Disk full', hubBuild: 'b1' });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(sync.retry).toHaveBeenCalled();
    sync.emit({ phase: 'syncing', overlay: true });
    await tick();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  it('asks for setup on a new tablet', async () => {
    const { store } = await makeStore({ settings: { deviceName: '' } });
    render(App, { store, sync: fakeSync() });
    expect(screen.getByRole('heading', { name: 'Set up this tablet' })).toBeTruthy();
  });

  it('reopens an unfinished form', async () => {
    const { store } = await makeStore();
    await store.startMatch({ matchKey: 'qm1', slot: 'red1', team: 5098 });
    render(App, { store, sync: fakeSync() });
    expect(screen.getByRole('heading', { name: 'Qual 1 · Red 1 · Team 5098' })).toBeTruthy();
  });

  it('warns when storage is not protected or nearly full', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: async () => false, estimate: async () => ({ quota: 100 * 1024 * 1024, usage: 90 * 1024 * 1024 }) },
    });
    try {
      const { store } = await makeStore();
      render(App, { store, sync: fakeSync() });
      expect(await screen.findByText(/hasn't protected the app's storage/)).toBeTruthy();
      expect(await screen.findByText(/almost out of storage space/)).toBeTruthy();
    } finally {
      delete (navigator as { storage?: unknown }).storage;
    }
  });

  it('shows sync progress, completion and errors', async () => {
    const { store } = await makeStore();
    const sync = fakeSync();
    render(App, { store, sync });

    sync.emit({ phase: 'syncing', overlay: true, progress: { done: 1, total: 3 } });
    await tick();
    expect(screen.getByText('Syncing — do not unplug')).toBeTruthy();
    expect(screen.getByText('1 of 3 items')).toBeTruthy();

    sync.emit({ phase: 'done' });
    await tick();
    expect(screen.getByText('✓ Sync complete — safe to unplug')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(sync.dismiss).toHaveBeenCalled();

    sync.emit({ phase: 'error', error: 'Disk full' });
    await tick();
    expect(screen.getByText('Disk full')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(sync.retry).toHaveBeenCalled();
  });
});
