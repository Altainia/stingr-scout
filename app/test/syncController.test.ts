import { describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '../src/lib/sync';
import { SyncController, type SyncControllerDeps, type SyncView } from '../src/lib/syncController';
import { CONFIG } from './helpers';

const RESULT: SyncResult = { acked: 1, rejected: 0, photos: 0, removed: 0, config: CONFIG };

function setup(syncImpl?: SyncControllerDeps['sync']) {
  const state = { online: true, pending: false };
  const sync = vi.fn<SyncControllerDeps['sync']>(syncImpl ?? (async onProgress => {
    onProgress({ done: 1, total: 1 });
    return RESULT;
  }));
  const onSynced = vi.fn();
  const c = new SyncController({
    ping: async () => (state.online ? { appBuild: 'b1' } : null),
    sync,
    hasPending: async () => state.pending,
    onSynced,
  });
  const views: SyncView[] = [];
  c.subscribe(v => views.push(v));
  return { c, state, sync, onSynced, views };
}

describe('SyncController', () => {
  it('syncs when the hub appears and then says it is safe to unplug', async () => {
    const { c, sync, onSynced, views } = setup();
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledWith(RESULT);
    expect(views.some(v => v.phase === 'syncing' && v.overlay && v.progress.done === 1)).toBe(true);
    expect(c.view).toMatchObject({ phase: 'done', overlay: true, hubBuild: 'b1', error: null });
  });

  it('stays put while connected unless new records are waiting', async () => {
    const { c, state, sync } = setup();
    await c.tick();
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(1);
    state.pending = true;
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('clears the overlay when unplugged and syncs again on the next plug-in', async () => {
    const { c, state, sync } = setup();
    await c.tick();
    state.online = false;
    await c.tick();
    expect(c.view).toMatchObject({ phase: 'offline', overlay: false });
    state.online = true;
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('shows an error and waits for Retry', async () => {
    const s = setup(async () => { throw new Error('Disk full'); });
    await s.c.tick();
    expect(s.c.view).toMatchObject({ phase: 'error', overlay: true, error: 'Disk full' });
    await s.c.tick();
    expect(s.sync).toHaveBeenCalledTimes(1);
    await s.c.retry();
    expect(s.sync).toHaveBeenCalledTimes(2);
  });

  it('lets the scout dismiss the finished overlay', async () => {
    const { c } = setup();
    await c.tick();
    c.dismiss();
    expect(c.view).toMatchObject({ phase: 'done', overlay: false });
  });

  it('never runs two polls at once', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const s = setup(async () => { await gate; return RESULT; });
    const first = s.c.tick();
    await s.c.tick();
    release();
    await first;
    expect(s.sync).toHaveBeenCalledTimes(1);
  });
});
