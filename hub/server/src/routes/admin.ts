import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { openDb, SCHEMA_VERSION, schemaVersion } from '../db';
import { HttpError } from '../http';
import { listDevices } from '../store/devices';

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

export function adminRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/backup', async (_req, reply) => {
    const tmp = join(tmpdir(), `stingr-backup-${randomUUID()}.db`);
    try {
      ctx.db.exec(`VACUUM INTO ${sqlString(tmp)}`);
      const data = await readFile(tmp);
      return reply
        .type('application/octet-stream')
        .header('content-disposition', `attachment; filename="stingr-backup-${stamp(ctx.now())}.db"`)
        .send(data);
    } finally {
      await rm(tmp, { force: true });
    }
  });

  app.post('/api/restore', async req => {
    if (!ctx.dbPath) throw new HttpError(400, 'Restore needs a database file (not available in this mode)');
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, 'Send the backup file as application/octet-stream');
    const dbPath = ctx.dbPath;
    const incoming = `${dbPath}.restore`;
    await writeFile(incoming, req.body);
    try {
      const check = new DatabaseSync(incoming);
      try {
        const v = schemaVersion(check);
        check.prepare('SELECT COUNT(*) FROM records').get();
        if (v < 1 || v > SCHEMA_VERSION) throw new Error(`unsupported schema version ${v}`);
      } finally {
        check.close();
      }
    } catch {
      await rm(incoming, { force: true });
      throw new HttpError(422, 'That file is not a Stingr Scout backup');
    }
    ctx.db.exec(`VACUUM INTO ${sqlString(`${dbPath}.before-restore-${stamp(ctx.now())}`)}`);
    ctx.db.close();
    for (const suffix of ['-wal', '-shm']) await rm(dbPath + suffix, { force: true });
    await rename(incoming, dbPath);
    ctx.db = openDb(dbPath); // migrates older backups forward
    return { ok: true };
  });

  app.get('/api/devices', async () => ({
    adb: ctx.adb?.status ?? { available: false, devices: [], error: 'USB watcher is not running' },
    devices: listDevices(ctx.db),
  }));
}
