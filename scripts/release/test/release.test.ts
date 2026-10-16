import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { devVersion, launcherScript, NODE_URL, parseArgs, releaseReadme, sha256File, verifySha256 } from '../lib';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function tempFile(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'stingr-rel-'));
  dirs.push(dir);
  const path = join(dir, 'f');
  writeFileSync(path, content);
  return path;
}

describe('checksums', () => {
  it('computes SHA-256', async () => {
    expect(await sha256File(tempFile('hello\n'))).toBe('5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03');
  });
  it('rejects a file whose checksum does not match', async () => {
    await expect(verifySha256(tempFile('tampered'), '0'.repeat(64))).rejects.toThrow('Checksum mismatch');
  });
});

describe('release files', () => {
  it('points at the pinned Node.js build', () => {
    expect(NODE_URL).toBe('https://nodejs.org/dist/v22.22.1/node-v22.22.1-linux-x64.tar.xz');
  });
  it('writes a launcher that finds its own folder through the stingr-hub symlink', () => {
    const s = launcherScript();
    expect(s.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(s).toContain('readlink -f "$0"');
    expect(s).toContain('export STINGR_WEB_ROOT="$HERE"');
    expect(s).toContain('exec "$HERE/node" --disable-warning=ExperimentalWarning "$HERE/hub.mjs" "$@"');
  });
  it('explains how to install in the README', () => {
    const r = releaseReadme('v0.1.0');
    expect(r).toContain('Stingr Scout hub v0.1.0');
    expect(r).toContain('./install.sh');
  });
});

describe('arguments', () => {
  it('reads version, node binary and output folder', () => {
    expect(parseArgs(['--version', 'v1.2.3', '--node', '/usr/bin/node', '--out', 'tmp/rel'])).toEqual({ version: 'v1.2.3', nodeBinary: '/usr/bin/node', outDir: 'tmp/rel' });
  });
  it('defaults to a dated dev version in release/', () => {
    const a = parseArgs([]);
    expect(a.outDir).toBe('release');
    expect(a.version).toMatch(/^dev-\d{14}$/);
    expect(devVersion(new Date('2027-03-01T12:34:56Z'))).toBe('dev-20270301123456');
  });
});
