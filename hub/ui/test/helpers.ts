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
