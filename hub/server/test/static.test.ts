import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAppBuild } from '../src/appBuild';
import { makeApp } from './helpers';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function builtApp() {
  const dir = mkdtempSync(join(tmpdir(), 'stingr-dist-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'index.html'), '<h1>app</h1>');
  writeFileSync(join(dir, 'sw.js'), '// worker');
  writeFileSync(join(dir, 'build.json'), JSON.stringify({ build: '20271015120000' }));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), '// code');
  return dir;
}

describe('resolveAppBuild', () => {
  it('prefers the environment, then build.json, then "dev"', () => {
    const dir = builtApp();
    expect(resolveAppBuild(dir, 'from-env')).toBe('from-env');
    expect(resolveAppBuild(dir, undefined)).toBe('20271015120000');
    expect(resolveAppBuild(join(dir, 'missing'), undefined)).toBe('dev');
  });
});

describe('serving the tablet app', () => {
  it('asks browsers to re-check the app shell but not hashed assets', async () => {
    const app = await makeApp({ staticRoots: { app: builtApp() } });
    for (const url of ['/', '/sw.js', '/build.json']) {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache');
    }
    const asset = await app.inject({ url: '/assets/index-abc123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).not.toBe('no-cache');
  });
});
