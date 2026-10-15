import { describe, expect, it } from 'vitest';
import { ApiError, createApi } from '../src/lib/api';

function recorder(reply: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createApi(async (url, init) => {
    calls.push({ url, init });
    return reply(url, init);
  });
  return { api, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createApi', () => {
  it('reads JSON from GET endpoints', async () => {
    const { api, calls } = recorder(() => json({ events: [], current: null }));
    expect(await api.events()).toEqual({ events: [], current: null });
    expect(calls[0]).toMatchObject({ url: '/api/events', init: { method: 'GET' } });
  });

  it('sends JSON bodies', async () => {
    const { api, calls } = recorder(() => json({ events: [], current: null }));
    await api.createEvent({ key: '2027mokc', name: 'Heartland', redSide: 'right' });
    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ key: '2027mokc', name: 'Heartland', redSide: 'right' });
  });

  it('sends CSV and backup files with their own content types', async () => {
    const { api, calls } = recorder(() => json({ matches: 1 }));
    await api.importScheduleCsv('1,1,2,3,4,5,6');
    expect(new Headers(calls[0].init?.headers).get('content-type')).toBe('text/csv');
    expect(calls[0].init?.body).toBe('1,1,2,3,4,5,6');
    await api.restore(new Blob(['x']));
    expect(new Headers(calls[1].init?.headers).get('content-type')).toBe('application/octet-stream');
  });

  it('returns the body of expected 422 answers', async () => {
    const { api } = recorder(() => json({ ok: false, errors: ['Form has no questions'], warnings: [] }, 422));
    expect(await api.publish('match')).toEqual({ ok: false, errors: ['Form has no questions'], warnings: [] });
  });

  it("turns other failures into ApiError with the hub's message", async () => {
    const { api } = recorder(() => json({ error: 'No current event is selected.' }, 409));
    const err = await api.coverage().catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: 'No current event is selected.' });
  });

  it('explains when the hub cannot be reached', async () => {
    const api = createApi(async () => { throw new TypeError('Failed to fetch'); });
    await expect(api.devices()).rejects.toMatchObject({ status: 0, message: "Can't reach the hub server. Is it still running?" });
  });

  it('escapes path parts', async () => {
    const { api, calls } = recorder(() => json([]));
    await api.history('a/b');
    expect(calls[0].url).toBe('/api/records/a%2Fb/history');
  });
});
