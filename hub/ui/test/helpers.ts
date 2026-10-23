import { vi } from 'vitest';
import { type Api, createApi } from '../src/lib/api';

/** An Api whose every method fails unless the test supplies it. */
export function fakeApi(over: Partial<Api> = {}): Api {
  const names = Object.keys(createApi(async () => new Response())) as (keyof Api)[];
  const base = Object.fromEntries(names.map(n => [n, vi.fn(async () => {
    throw new Error(`api.${String(n)} was not expected in this test`);
  })]));
  return { ...base, ...over } as Api;
}

/** Stands in for the browser's EventSource, so tests can play the hub saying "changed" (or reconnecting). */
export function fakeChanges() {
  const streams: { url: string; onmessage: (() => void) | null; onopen: (() => void) | null; closed: boolean }[] = [];
  vi.stubGlobal('EventSource', class {
    url: string;
    onmessage: (() => void) | null = null;
    onopen: (() => void) | null = null;
    closed = false;
    constructor(url: string) { this.url = url; streams.push(this); }
    close() { this.closed = true; }
  });
  const live = () => streams.filter(s => !s.closed);
  return {
    streams,
    open: () => live().length,
    changed: () => live().forEach(s => s.onmessage?.()),
    reconnected: () => live().forEach(s => s.onopen?.()),
  };
}
