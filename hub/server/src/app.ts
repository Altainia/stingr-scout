import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { QrAssembler } from '@stingr/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AdbWatcher } from './adb';
import type { Db } from './db';
import { HttpError } from './http';
import { dataRoutes } from './routes/data';
import { eventRoutes } from './routes/event';
import { formRoutes } from './routes/forms';
import { recordRoutes } from './routes/records';
import { scheduleImportRoutes } from './routes/scheduleImport';
import { syncRoutes } from './routes/sync';

export interface HubContext {
  db: Db;
  dbPath: string | null;
  appBuild: string;
  now: () => string;
  fetch: typeof fetch;
  adb: AdbWatcher | null;
  qr: QrAssembler;
}

export interface AppOptions {
  db: Db;
  dbPath?: string | null;
  appBuild?: string;
  now?: () => string;
  fetch?: typeof fetch;
  adb?: AdbWatcher | null;
  staticRoots?: { app?: string; hubUi?: string };
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const ctx: HubContext = {
    db: opts.db,
    dbPath: opts.dbPath ?? null,
    appBuild: opts.appBuild ?? 'dev',
    now: opts.now ?? (() => new Date().toISOString()),
    fetch: opts.fetch ?? fetch,
    adb: opts.adb ?? null,
    qr: new QrAssembler(),
  };

  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
  app.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 1024 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof HttpError) return reply.status(error.status).send({ error: error.message });
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode;
    if (status && status < 500) return reply.status(status).send({ error: err.message });
    app.log.error(err);
    return reply.status(500).send({ error: `Internal error: ${err.message}` });
  });

  syncRoutes(app, ctx);
  recordRoutes(app, ctx);
  formRoutes(app, ctx);
  eventRoutes(app, ctx);
  scheduleImportRoutes(app, ctx);
  dataRoutes(app, ctx);

  await registerStatic(app, opts.staticRoots ?? {});
  return app;
}

async function registerStatic(app: FastifyInstance, roots: { app?: string; hubUi?: string }): Promise<void> {
  if (roots.app && existsSync(roots.app)) {
    await app.register(fastifyStatic, { root: roots.app, prefix: '/' });
  } else {
    app.get('/', async (_req, reply) => reply.type('text/plain').send('The tablet app has not been built yet (npm run build).'));
  }
  if (roots.hubUi && existsSync(roots.hubUi)) {
    await app.register(fastifyStatic, { root: roots.hubUi, prefix: '/hub/', decorateReply: false });
  } else {
    app.get('/hub/', async (_req, reply) => reply.type('text/plain').send('The hub UI has not been built yet (npm run build).'));
  }
  app.get('/hub', async (_req, reply) => reply.redirect('/hub/'));
}
