import { afterEach, describe, expect, it, vi } from 'vitest';
import { onHubChange } from '../src/lib/changes';
import { fakeChanges } from './helpers';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('onHubChange', () => {
  it('shares one connection, and calls each subscriber once per burst of changes', async () => {
    vi.useFakeTimers();
    const hub = fakeChanges();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = onHubChange(a);
    const stopB = onHubChange(b);
    expect(hub.streams).toHaveLength(1);
    expect(hub.streams[0].url).toBe('/api/changes');
    hub.changed();
    hub.changed();
    hub.changed(); // a sync in several batches
    expect(a).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    hub.reconnected();
    await vi.advanceTimersByTimeAsync(300);
    expect(a).toHaveBeenCalledTimes(2); // catches up after a dropped connection
    stopA();
    expect(hub.open()).toBe(1);
    stopB();
    expect(hub.open()).toBe(0); // closed when nobody listens
  });
});

describe('onHubChange across hub tabs', () => {
  /** Stand-ins for the browser's Web Locks and BroadcastChannel, shared by every "tab" (module copy) in the test. */
  function fakeBrowser() {
    const waiting: { grant: () => Promise<void>; signal?: AbortSignal }[] = [];
    let held = false;
    const next = () => {
      const w = waiting.shift();
      if (!w) return;
      held = true;
      void w.grant().finally(() => { held = false; next(); });
    };
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, opts: { signal?: AbortSignal }, fn: () => Promise<void>) => new Promise<void>((resolve, reject) => {
          const entry = { grant: () => fn().then(resolve, reject), signal: opts.signal };
          opts.signal?.addEventListener('abort', () => {
            const i = waiting.indexOf(entry);
            if (i >= 0) { waiting.splice(i, 1); reject(new DOMException('aborted', 'AbortError')); }
          });
          waiting.push(entry);
          if (!held) next();
        }),
      },
    });
    const channels: { name: string; onmessage: ((e: { data: unknown }) => void) | null; closed: boolean }[] = [];
    vi.stubGlobal('BroadcastChannel', class {
      name: string; onmessage: ((e: { data: unknown }) => void) | null = null; closed = false;
      constructor(name: string) { this.name = name; channels.push(this); }
      postMessage(data: unknown) { for (const c of channels) if (c !== this && !c.closed && c.name === this.name) c.onmessage?.({ data }); }
      close() { this.closed = true; }
    });
  }
  const tab = async () => { vi.resetModules(); return (await import('../src/lib/changes')).onHubChange; };

  it('keeps one connection for every open tab, and tells every tab about changes', async () => {
    vi.useFakeTimers();
    fakeBrowser();
    const hub = fakeChanges();
    const [inA, inB, inC] = [vi.fn(), vi.fn(), vi.fn()];
    (await tab())(inA);
    (await tab())(inB);
    (await tab())(inC);
    await vi.advanceTimersByTimeAsync(300);
    expect(hub.open()).toBe(1);
    inA.mockClear(); inB.mockClear(); inC.mockClear();
    hub.changed();
    await vi.advanceTimersByTimeAsync(300);
    expect([inA, inB, inC].map(f => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('hands the connection to another tab when the one holding it closes', async () => {
    vi.useFakeTimers();
    fakeBrowser();
    const hub = fakeChanges();
    const stopA = (await tab())(vi.fn());
    const inB = vi.fn();
    (await tab())(inB);
    await vi.advanceTimersByTimeAsync(300);
    stopA();
    await vi.advanceTimersByTimeAsync(300);
    expect(hub.open()).toBe(1);
    inB.mockClear();
    hub.changed();
    await vi.advanceTimersByTimeAsync(300);
    expect(inB).toHaveBeenCalledTimes(1);
  });

  it('lets go of its place in line when a waiting tab stops listening', async () => {
    vi.useFakeTimers();
    fakeBrowser();
    const hub = fakeChanges();
    const stopA = (await tab())(vi.fn());
    const stopB = (await tab())(vi.fn());
    await vi.advanceTimersByTimeAsync(300);
    stopB();
    stopA();
    await vi.advanceTimersByTimeAsync(300);
    expect(hub.open()).toBe(0);
  });
});
