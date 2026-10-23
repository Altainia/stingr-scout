import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

/**
 * A server-sent event stream that tells open hub pages "changed" after any request that changed something
 * (a tablet sync, a QR scan, publishing a form, …), so they refresh only when there's something new.
 */
export function changesRoutes(app: FastifyInstance): void {
  const open = new Set<ServerResponse>();

  app.addHook('onResponse', async (req, reply) => {
    const changing = req.method !== 'GET' && req.method !== 'HEAD' && req.url.startsWith('/api/') && reply.statusCode < 400;
    if (changing) for (const res of open) res.write('data: changed\n\n');
  });

  app.addHook('preClose', async () => { // before the server waits for connections to finish
    for (const res of open) res.end();
    open.clear();
  });

  app.get('/api/changes', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': connected\n\n');
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    open.add(res);
    req.raw.on('close', () => {
      clearInterval(keepAlive);
      open.delete(res);
    });
  });
}
