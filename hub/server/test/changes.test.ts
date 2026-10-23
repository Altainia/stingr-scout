import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

let app: FastifyInstance | null = null;
afterEach(async () => { await app?.close(); app = null; });

/** Opens the change stream and counts the "changed" messages it receives. */
async function listen() {
  app = await makeApp();
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const res = await fetch(`${url}/api/changes`);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  let text = '';
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      text += new TextDecoder().decode(value);
    }
  })();
  const changed = () => (text.match(/^data: changed$/gm) ?? []).length;
  const settle = () => new Promise(r => setTimeout(r, 100));
  return { url, changed, settle };
}

describe('GET /api/changes', () => {
  it('tells open pages when a request changes something, and only then', async () => {
    const { url, changed, settle } = await listen();
    await fetch(`${url}/api/events`); // reading changes nothing
    await fetch(`${url}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'x' }) }); // refused: 400
    await settle();
    expect(changed()).toBe(0);
    await fetch(`${url}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: '2027abc' }) });
    await settle();
    expect(changed()).toBe(1);
  });
});
