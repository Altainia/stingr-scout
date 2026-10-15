import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { parseKind, requireEvent } from '../http';
import { currentRecords, recordHistory } from '../store/records';

export function recordRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/records', async req => {
    const kind = parseKind((req.query as { kind?: string }).kind ?? 'match');
    return currentRecords(ctx.db, requireEvent(ctx.db).key, kind);
  });
  app.get('/api/records/:id/history', async req => recordHistory(ctx.db, (req.params as { id: string }).id));
}
