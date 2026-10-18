import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdbWatcher } from '../src/adb';
import { openDb } from '../src/db';
import { makeApp } from './helpers';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function fileApp() {
  const dir = mkdtempSync(join(tmpdir(), 'stingr-admin-'));
  dirs.push(dir);
  const dbPath = join(dir, 'stingr.db');
  return { dir, app: await makeApp({ db: openDb(dbPath), dbPath }) };
}

const keys = async (app: Awaited<ReturnType<typeof makeApp>>) =>
  (await app.inject({ url: '/api/events' })).json().events.map((e: { key: string }) => e.key);

describe('backup and restore', () => {
  it('restores a backup and keeps a copy of what it replaced', async () => {
    const { dir, app } = await fileApp();
    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027one' } });
    const backup = await app.inject({ url: '/api/backup' });
    expect(backup.headers['content-disposition']).toBe('attachment; filename="stingr-backup-2027-03-01T12-00-00-000Z.db"');

    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027two' } });
    expect(await keys(app)).toEqual(['2027one', '2027two']);

    const restore = await app.inject({ method: 'POST', url: '/api/restore', headers: { 'content-type': 'application/octet-stream' }, payload: backup.rawPayload });
    expect(restore.json()).toEqual({ ok: true });
    expect(await keys(app)).toEqual(['2027one']);
    expect(readdirSync(dir).some(f => f.startsWith('stingr.db.before-restore-'))).toBe(true);
  });

  it('gives the hub a new identity after a restore, so tablets do not prune against the restored data', async () => {
    const { app } = await fileApp();
    const sync = async () => (await app.inject({ method: 'POST', url: '/api/sync', payload: { device: { id: 'd', name: 'T' }, records: [] } })).json().config;
    const before = await sync();
    const backup = await app.inject({ url: '/api/backup' });
    await app.inject({ method: 'POST', url: '/api/restore', headers: { 'content-type': 'application/octet-stream' }, payload: backup.rawPayload });
    expect((await sync()).hubId).not.toBe(before.hubId);
  });

  it('refuses a file that is not a backup and changes nothing', async () => {
    const { app } = await fileApp();
    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027one' } });
    const res = await app.inject({ method: 'POST', url: '/api/restore', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('hello') });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'That file is not a Stingr Scout backup' });
    expect(await keys(app)).toEqual(['2027one']);
  });

  it('cannot restore an in-memory database', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/restore', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('x') });
    expect(res.statusCode).toBe(400);
  });
});

describe('devices', () => {
  it('reports the USB watcher status and known tablets', async () => {
    const adb = { status: { available: true, devices: [{ serial: 'S1', state: 'device', reversed: true }] } } as unknown as AdbWatcher;
    const app = await makeApp({ adb });
    expect((await app.inject({ url: '/api/devices' })).json()).toEqual({ adb: adb.status, devices: [] });
  });
  it('says when the watcher is not running', async () => {
    const res = (await (await makeApp()).inject({ url: '/api/devices' })).json();
    expect(res.adb).toEqual({ available: false, devices: [], error: 'USB watcher is not running' });
  });
});
