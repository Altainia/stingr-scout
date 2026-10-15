import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchForUpdates } from '../src/lib/swUpdate';
import type { SyncView } from '../src/lib/syncController';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function setup(update: () => Promise<void>) {
  let listener: (v: SyncView) => void = () => {};
  const reg = { update: vi.fn(update), waiting: null };
  const container = { controller: {}, register: vi.fn(async () => reg), addEventListener: vi.fn() };
  const sync = { subscribe: (fn: (v: SyncView) => void) => { listener = fn; return () => {}; } };
  const emit = (patch: Partial<SyncView> = {}) =>
    listener({ phase: 'done', progress: { done: 0, total: 0 }, error: null, overlay: false, hubBuild: 'new', ...patch });
  const start = (currentBuild = 'old') => watchForUpdates({ currentBuild, sync, isSafe: () => false, container: container as never });
  return { update: reg.update, emit, start };
}

describe('watchForUpdates', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tries the update again after a failed download', async () => {
    let calls = 0;
    const s = setup(async () => { if (++calls === 1) throw new Error('cable pulled'); });
    await s.start();
    s.emit();
    await flush();
    s.emit();
    await flush();
    expect(s.update).toHaveBeenCalledTimes(2);
    s.emit();
    expect(s.update).toHaveBeenCalledTimes(2); // that one worked; nothing more until the hub changes
  });

  it('checks again on the next plug-in', async () => {
    const s = setup(async () => {});
    await s.start();
    s.emit();
    s.emit({ phase: 'offline' });
    s.emit();
    expect(s.update).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the hub has this same build', async () => {
    const s = setup(async () => {});
    await s.start('new');
    s.emit();
    expect(s.update).not.toHaveBeenCalled();
  });
});
