import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const NODE_VERSION = '22.22.1';
export const NODE_TARBALL = `node-v${NODE_VERSION}-linux-x64.tar.xz`;
export const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}`;
/** From https://nodejs.org/dist/v22.22.1/SHASUMS256.txt */
export const NODE_SHA256 = '9a6bc82f9b491279147219f6a18add1e18424dce90d41d2a5fcd69d4924ba3aa';
export const RELEASE_NAME = 'stingr-scout-hub';
export const TARBALL_NAME = 'stingr-scout-hub-linux-x64.tar.gz';

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

export async function verifySha256(path: string, expected: string): Promise<void> {
  const actual = await sha256File(path);
  if (actual !== expected) throw new Error(`Checksum mismatch for ${path}: expected ${expected}, got ${actual}`);
}

export function launcherScript(): string {
  return `#!/usr/bin/env bash
# Starts the Stingr Scout hub. Close this window (or press Ctrl+C) to stop it.
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
export STINGR_WEB_ROOT="$HERE"
exec "$HERE/node" --disable-warning=ExperimentalWarning "$HERE/hub.mjs" "$@"
`;
}

export function releaseReadme(version: string): string {
  return `Stingr Scout hub ${version}

Install or upgrade (Ubuntu / Debian, 64-bit):
    ./install.sh

It installs adb if needed (it may ask for your password), puts the hub in
~/.local/share/stingr-scout, adds a "Stingr Scout Hub" entry to your applications
menu and a stingr-hub command. Your scouting data is kept in
~/.local/share/stingr-scout/data and is never touched by installing or upgrading.

Remove the program (data is kept):
    ~/.local/share/stingr-scout/app/install.sh --uninstall
`;
}

export function devVersion(now: Date = new Date()): string {
  return `dev-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

export function parseArgs(argv: string[]): { version: string; nodeBinary?: string; outDir: string } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const nodeBinary = get('--node');
  return { version: get('--version') ?? devVersion(), ...(nodeBinary ? { nodeBinary } : {}), outDir: get('--out') ?? 'release' };
}
