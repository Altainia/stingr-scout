import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRelease } from '../build';

const PORT = 5177;
const VERSION = 'v0.0.0-test';
let work: string;
let home: string;
let unpacked: string;

const env = () => ({ PATH: process.env.PATH ?? '', HOME: home, STINGR_SKIP_ADB: '1' });

function install(args: string[] = []) {
  const r = spawnSync('/bin/bash', [join(unpacked, 'stingr-scout-hub/install.sh'), ...args], { env: env(), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`install.sh failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

async function startHub(): Promise<ChildProcess> {
  const hub = spawn(join(home, '.local/bin/stingr-hub'), ['--no-open'], {
    env: { ...env(), STINGR_PORT: String(PORT), ADB: 'false' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/ping`);
      if (res.ok) return hub;
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  hub.kill('SIGINT');
  throw new Error('The installed hub did not start');
}

async function stopHub(hub: ChildProcess) {
  const exited = new Promise(r => hub.once('exit', r));
  hub.kill('SIGINT');
  await exited;
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'stingr-pkg-'));
  home = join(work, 'home');
  unpacked = join(work, 'unpacked');
  mkdirSync(home);
  mkdirSync(unpacked);
  const tarball = await buildRelease({ version: VERSION, nodeBinary: process.execPath, outDir: join(work, 'out') });
  execFileSync('tar', ['-xzf', tarball, '-C', unpacked]);
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('release package', () => {
  it('installs and runs from the stingr-hub command', async () => {
    expect(install()).toContain(`Installed Stingr Scout hub ${VERSION}.`);
    const hub = await startHub();
    try {
      expect(await (await fetch(`http://127.0.0.1:${PORT}/api/ping`)).json()).toEqual({ hub: 'stingr-scout', appBuild: VERSION });
      expect(await (await fetch(`http://127.0.0.1:${PORT}/hub/`)).text()).toContain('Stingr Scout Hub');
      expect((await fetch(`http://127.0.0.1:${PORT}/`)).status).toBe(200);
      const created = await fetch(`http://127.0.0.1:${PORT}/api/events`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: '2027pkg', name: 'Package Test' }),
      });
      expect(created.ok).toBe(true);
    } finally {
      await stopHub(hub);
    }
    expect(existsSync(join(home, '.local/share/stingr-scout/data/stingr.db'))).toBe(true);
  });

  it('keeps the data through an upgrade', async () => {
    install(); // the same release again stands in for a newer one
    const hub = await startHub();
    try {
      const { events } = await (await fetch(`http://127.0.0.1:${PORT}/api/events`)).json();
      expect(events.map((e: { key: string }) => e.key)).toEqual(['2027pkg']);
    } finally {
      await stopHub(hub);
    }
  });

  it('uninstalls and leaves the data', () => {
    expect(install(['--uninstall'])).toContain('Your scouting data is still in');
    expect(existsSync(join(home, '.local/share/stingr-scout/app'))).toBe(false);
    expect(existsSync(join(home, '.local/share/stingr-scout/data/stingr.db'))).toBe(true);
  });
});
