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
