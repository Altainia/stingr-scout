import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { HttpError } from '../http';
import { deleteEvent, eventCounts, seasonCounts, startNewSeason } from '../store/clear';

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
const stamp = (iso: string) => iso.replace(/[:.]/g, '-');
const confirmOf = (body: unknown): string =>
  typeof body === 'object' && body !== null && typeof (body as { confirm?: unknown }).confirm === 'string' ? (body as { confirm: string }).confirm : '';

/** Saves a copy of the database in <data folder>/backups before anything is removed. Throws if it can't. */
async function backupFirst(ctx: HubContext): Promise<string | null> {
  if (!ctx.dbPath) return null;
  const dir = join(dirname(ctx.dbPath), 'backups');
  await mkdir(dir, { recursive: true });
  const name = `stingr-${stamp(ctx.now())}.db`;
  ctx.db.exec(`VACUUM INTO ${sqlString(join(dir, name))}`);
  return name;
}

export function clearRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/events/:key/clear', async req => {
    const counts = eventCounts(ctx.db, (req.params as { key: string }).key);
    if (!counts) throw new HttpError(404, 'No such event');
    return counts;
  });

  app.post('/api/events/:key/delete', async req => {
    const { key } = req.params as { key: string };
    if (!eventCounts(ctx.db, key)) throw new HttpError(404, 'No such event');
    if (confirmOf(req.body) !== key) throw new HttpError(400, 'Type the event key to confirm');
    const backup = await backupFirst(ctx);
    return { ok: true, backup, removed: deleteEvent(ctx.db, key) };
  });

  app.get('/api/season/clear', async () => seasonCounts(ctx.db));

  app.post('/api/season/new', async req => {
    if (confirmOf(req.body) !== 'NEW SEASON') throw new HttpError(400, 'Type NEW SEASON to confirm');
    const backup = await backupFirst(ctx);
    return { ok: true, backup, removed: startNewSeason(ctx.db) };
  });
}
