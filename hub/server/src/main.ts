import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdbWatcher, nodeAdbExec } from './adb';
import { resolveAppBuild } from './appBuild';
import { buildApp } from './app';
import { openDb } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.STINGR_PORT ?? 5098);
const dataDir = process.env.STINGR_DATA_DIR ?? join(homedir(), '.local', 'share', 'stingr-scout', 'data');
const webRoot = process.env.STINGR_WEB_ROOT ?? resolve(here, '../../..');
const url = `http://localhost:${port}/hub/`;

function openBrowser(): void {
  if (process.argv.includes('--no-open')) return;
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'stingr.db');
const db = openDb(dbPath);
const adb = new AdbWatcher(nodeAdbExec(process.env.ADB ?? 'adb'), port);
const app = await buildApp({
  db,
  dbPath,
  adb,
  appBuild: resolveAppBuild(join(webRoot, 'app', 'dist')),
  staticRoots: { app: join(webRoot, 'app', 'dist'), hubUi: join(webRoot, 'hub', 'ui', 'dist') },
});

try {
  await app.listen({ host: '127.0.0.1', port });
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.log(`A Stingr Scout hub is already running at ${url}. Opening it.`);
    openBrowser();
    process.exit(0);
  }
  throw e;
}

adb.start();
console.log(`Stingr Scout hub running at ${url}`);
console.log(`Data folder: ${dataDir}`);
openBrowser();

const shutdown = async () => {
  adb.stop();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
