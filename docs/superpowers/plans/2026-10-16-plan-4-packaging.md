# Plan 4 — Packaging, Install and Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make installing the hub on the team's Linux laptop one download and one command: a self-contained release (bundled hub server, both web apps, its own Node.js runtime), an `install.sh` that installs adb, the program, a `stingr-hub` command and an app-menu launcher without touching scouting data, and GitHub Actions that test every push and publish a release for every version tag.

**Architecture:** `scripts/release/build.ts` builds both web apps, bundles `hub/server/src/main.ts` into one `hub.mjs` with esbuild, adds the official Node.js 22.22.1 linux-x64 binary (downloaded once, checksum-verified, cached in `.cache/`) and a launcher script, and writes `release/stingr-scout-hub-linux-x64.tar.gz`. `scripts/release/install.sh` (shipped inside the release) installs into `~/.local/share/stingr-scout/app`, keeps data in `~/.local/share/stingr-scout/data`. A packaging test builds a real release, installs it into a temporary home folder, runs it, upgrades it and uninstalls it.

**Tech Stack:** esbuild 0.28.2, bash, GitHub Actions, Node.js 22.22.1.

**Spec:** `docs/superpowers/specs/2026-10-15-stingr-scout-design.md` §7 (packaging and installation).

**Verified before writing:** an esbuild bundle of the hub (ESM, with a `createRequire` banner) runs under plain `node` and serves `/api/ping`, `/hub/` and `/`; `https://nodejs.org/dist/v22.22.1/node-v22.22.1-linux-x64.tar.xz` exists with SHA-256 `9a6bc82f9b491279147219f6a18add1e18424dce90d41d2a5fcd69d4924ba3aa`.

## Global Constraints

- Release target: Linux x86_64 (Ubuntu/Debian for the automatic adb install). Release file name is fixed: `stingr-scout-hub-linux-x64.tar.gz`, unpacking to a `stingr-scout-hub/` folder.
- Bundled runtime: Node.js **22.22.1** (same as development), verified by SHA-256 before use. Started with `--disable-warning=ExperimentalWarning` (node:sqlite).
- Install locations (per user, no root except for `apt-get install adb`): program `${XDG_DATA_HOME:-~/.local/share}/stingr-scout/app`, data `…/stingr-scout/data`, command `~/.local/bin/stingr-hub`, menu entry `…/applications/stingr-scout.desktop`. Install, upgrade and uninstall never touch the data folder.
- The release's version (the git tag, e.g. `v0.1.0`) is the tablet app's build id (`STINGR_APP_BUILD`) so tablets update when a new release is installed.
- `.cache/` and `release/` are build outputs and are git-ignored.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only after `npm test` and `npm run typecheck` pass.

## Review Focus

1. Upgrading over an existing install must keep every event, form, record and photo (Task 5, `package.e2e.ts` "keeps the data through an upgrade").
2. A corrupted or tampered Node.js download must stop the build, not ship (Task 2, `release.test.ts` "rejects a file whose checksum does not match").
3. A laptop without adb (and with apt) gets adb installed; one without apt gets clear instructions instead of a half-install (Task 4, `install.test.ts` "installs adb with apt when it is missing" / "explains what to do without apt").
4. Running the installer from the already-installed copy (e.g. to repair) must not delete itself mid-copy (Task 4, `install.test.ts` "can be re-run from the installed copy").
5. The installed hub, started from the `stingr-hub` command via its symlink, finds its web files and reports the release version to tablets (Task 5, `package.e2e.ts` "installs and runs from the stingr-hub command").

---

## File Structure

```
.gitignore                        + .cache/, release/
package.json                      + esbuild dev dependency, "package" and "test:package" scripts
tsconfig.json                     + scripts
vitest.config.ts                  node project also runs scripts/**/*.test.ts
vitest.package.config.ts          the slow packaging test
hub/server/src/paths.ts           defaultDataDir (honours XDG_DATA_HOME)
hub/server/src/main.ts            (modify) use defaultDataDir
scripts/release/lib.ts            constants, checksum, launcher script, release README, CLI args
scripts/release/build.ts          builds the release tarball
scripts/release/install.sh        installer shipped in the release
scripts/release/test/release.test.ts
scripts/release/test/install.test.ts
scripts/release/test/package.e2e.ts
.github/workflows/ci.yml          tests on every push / pull request
.github/workflows/release.yml     builds and publishes a release for every v* tag
README.md                         installing and updating the hub; setting up tablets
```

---

### Task 1: Data folder follows the XDG convention

**Files:**
- Create: `hub/server/src/paths.ts`
- Modify: `hub/server/src/main.ts`
- Test: `hub/server/test/paths.test.ts`

**Interfaces:**
- Produces: `defaultDataDir(env?: NodeJS.ProcessEnv, home?: string): string` — `STINGR_DATA_DIR` if set, else `$XDG_DATA_HOME/stingr-scout/data`, else `<home>/.local/share/stingr-scout/data` (the installer uses the same rule for the program folder).

- [ ] **Step 1: Write the failing test**

`hub/server/test/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultDataDir } from '../src/paths';

describe('defaultDataDir', () => {
  it('uses STINGR_DATA_DIR when set', () => {
    expect(defaultDataDir({ STINGR_DATA_DIR: '/data/x', XDG_DATA_HOME: '/xdg' }, '/home/a')).toBe('/data/x');
  });
  it('follows XDG_DATA_HOME, like the installer', () => {
    expect(defaultDataDir({ XDG_DATA_HOME: '/xdg' }, '/home/a')).toBe('/xdg/stingr-scout/data');
  });
  it('defaults to ~/.local/share', () => {
    expect(defaultDataDir({}, '/home/a')).toBe('/home/a/.local/share/stingr-scout/data');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project node hub/server/test/paths.test.ts`
Expected: FAIL — cannot resolve `../src/paths`.

- [ ] **Step 3: Implement**

`hub/server/src/paths.ts`:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where the hub keeps its database: the same place the installer expects, outside the program folder. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  if (env.STINGR_DATA_DIR) return env.STINGR_DATA_DIR;
  const share = env.XDG_DATA_HOME || join(home, '.local', 'share');
  return join(share, 'stingr-scout', 'data');
}
```

In `hub/server/src/main.ts` replace the `const dataDir = …` line with `const dataDir = defaultDataDir();`, add `import { defaultDataDir } from './paths';`, and remove `homedir` from the `node:os` import if it is no longer used.

- [ ] **Step 4: Run tests and typecheck, then commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add hub/server
git commit -m "feat(hub): data folder follows XDG_DATA_HOME like the installer"
```

---

### Task 2: Release helpers — constants, checksum, launcher, README, arguments

**Files:**
- Modify: `vitest.config.ts` (node project includes `scripts/**/*.test.ts`), `tsconfig.json` (include `scripts`), `.gitignore`
- Create: `scripts/release/lib.ts`
- Test: `scripts/release/test/release.test.ts`

**Interfaces:**
- Produces:
  - `NODE_VERSION = '22.22.1'`, `NODE_TARBALL`, `NODE_URL`, `NODE_SHA256 = '9a6bc82f9b491279147219f6a18add1e18424dce90d41d2a5fcd69d4924ba3aa'`, `RELEASE_NAME = 'stingr-scout-hub'`, `TARBALL_NAME = 'stingr-scout-hub-linux-x64.tar.gz'`
  - `sha256File(path: string): Promise<string>`; `verifySha256(path: string, expected: string): Promise<void>` (throws "Checksum mismatch …")
  - `launcherScript(): string` — bash: resolves its own real folder through symlinks, sets `STINGR_WEB_ROOT`, `exec`s the bundled `node --disable-warning=ExperimentalWarning hub.mjs "$@"`
  - `releaseReadme(version: string): string`
  - `devVersion(now?: Date): string` — `dev-YYYYMMDDHHMMSS`
  - `parseArgs(argv: string[]): { version: string; nodeBinary?: string; outDir: string }` — `--version`, `--node`, `--out` (default `release`, version defaults to `devVersion()`)

- [ ] **Step 1: Wire the scripts folder into tests and typecheck**

In `vitest.config.ts`, change the node project's include to `['shared/**/*.test.ts', 'hub/server/**/*.test.ts', 'scripts/**/*.test.ts']`. In `tsconfig.json`, add `"scripts"` to `include`. Append to `.gitignore`:

```
.cache/
release/
```

Run: `npm run typecheck`
Expected: no errors (this now also checks `scripts/seed-demo.ts`; fix any type error it reports before continuing).

- [ ] **Step 2: Write the failing tests**

`scripts/release/test/release.test.ts`:

```ts
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
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run --project node scripts/release/test/release.test.ts`
Expected: FAIL — cannot resolve `../lib`.

- [ ] **Step 4: Implement `scripts/release/lib.ts`**

```ts
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
```

- [ ] **Step 5: Run tests and typecheck, then commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add .gitignore tsconfig.json vitest.config.ts scripts/release
git commit -m "feat(release): helpers for the release build"
```

---

### Task 3: Release builder

**Files:**
- Modify: `package.json` (esbuild dev dependency; `package` script)
- Create: `scripts/release/build.ts`

**Interfaces:**
- Consumes: Task 2 helpers; `npm run build`; `hub/server/src/main.ts`; `scripts/release/install.sh` (Task 4 — until then the builder copies whatever exists, so Task 3's manual run happens after Task 4's file exists; see Step 3).
- Produces: `buildRelease(opts: { version: string; nodeBinary?: string; outDir: string }): Promise<string>` returning the tarball path; `npm run package -- [--version vX.Y.Z] [--node /path/to/node] [--out DIR]`. Release folder contents: `hub.mjs`, `node`, `app/dist/…`, `hub/ui/dist/…`, `stingr-hub`, `install.sh`, `icon.png`, `VERSION`, `README.txt`.

- [ ] **Step 1: Add esbuild and the script**

```bash
npm install -D --save-exact esbuild@0.28.2
npm pkg set scripts.package="tsx scripts/release/build.ts"
```

- [ ] **Step 2: Implement `scripts/release/build.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  launcherScript, NODE_SHA256, NODE_TARBALL, NODE_URL, NODE_VERSION, parseArgs, RELEASE_NAME, releaseReadme,
  TARBALL_NAME, verifySha256,
} from './lib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface BuildOptions { version: string; nodeBinary?: string; outDir: string }

/** The pinned Node.js binary, downloaded once into .cache/ and checked against its published SHA-256. */
async function pinnedNode(cacheDir: string): Promise<string> {
  const tarball = join(cacheDir, NODE_TARBALL);
  if (!existsSync(tarball)) {
    mkdirSync(cacheDir, { recursive: true });
    console.log(`Downloading ${NODE_URL}`);
    const res = await fetch(NODE_URL);
    if (!res.ok) throw new Error(`Downloading Node.js failed: HTTP ${res.status}`);
    writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  }
  await verifySha256(tarball, NODE_SHA256);
  const dir = join(cacheDir, `node-v${NODE_VERSION}`);
  if (!existsSync(join(dir, 'node'))) {
    mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xJf', tarball, '-C', dir, '--strip-components=2', `node-v${NODE_VERSION}-linux-x64/bin/node`]);
  }
  return join(dir, 'node');
}

export async function buildRelease(opts: BuildOptions): Promise<string> {
  const out = resolve(ROOT, opts.outDir);
  const stage = join(out, RELEASE_NAME);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  // Both web apps; the tablet app's build id is the release version so tablets update to it.
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, STINGR_APP_BUILD: opts.version } });

  await build({
    entryPoints: [join(ROOT, 'hub/server/src/main.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: join(stage, 'hub.mjs'),
    // Some dependencies call require(); give the ES module bundle one.
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    logLevel: 'warning',
  });

  cpSync(join(ROOT, 'app/dist'), join(stage, 'app/dist'), { recursive: true });
  cpSync(join(ROOT, 'hub/ui/dist'), join(stage, 'hub/ui/dist'), { recursive: true });
  copyFileSync(opts.nodeBinary ?? (await pinnedNode(join(ROOT, '.cache'))), join(stage, 'node'));
  copyFileSync(join(ROOT, 'scripts/release/install.sh'), join(stage, 'install.sh'));
  copyFileSync(join(ROOT, 'app/public/icon-512.png'), join(stage, 'icon.png'));
  writeFileSync(join(stage, 'stingr-hub'), launcherScript());
  writeFileSync(join(stage, 'VERSION'), `${opts.version}\n`);
  writeFileSync(join(stage, 'README.txt'), releaseReadme(opts.version));
  for (const f of ['node', 'stingr-hub', 'install.sh']) chmodSync(join(stage, f), 0o755);

  const tarball = join(out, TARBALL_NAME);
  rmSync(tarball, { force: true });
  execFileSync('tar', ['-czf', tarball, '-C', out, RELEASE_NAME]);
  return tarball;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const tarball = await buildRelease(opts);
  console.log(`Built Stingr Scout hub ${opts.version}: ${tarball}`);
}
```

- [ ] **Step 3: Typecheck and commit** (the first real build runs in Task 5, once `install.sh` exists)

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add package.json package-lock.json scripts/release/build.ts
git commit -m "feat(release): build a self-contained hub release"
```

---

### Task 4: Installer

**Files:**
- Create: `scripts/release/install.sh`
- Test: `scripts/release/test/install.test.ts`

**Interfaces:**
- Consumes: a release folder (from Task 3) containing `stingr-hub`, `node`, `VERSION`, `icon.png`.
- Produces: `install.sh` (install/upgrade) and `install.sh --uninstall`; env `STINGR_SKIP_ADB=1` skips the adb step (tests only). Messages: "Installed Stingr Scout hub <version>.", "Stingr Scout hub removed. Your scouting data is still in <data>".

- [ ] **Step 1: Write the failing tests**

`scripts/release/test/install.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const INSTALLER = resolve(import.meta.dirname, '../install.sh');
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function setup(version = 'v9.9.9') {
  const root = mkdtempSync(join(tmpdir(), 'stingr-inst-'));
  dirs.push(root);
  const release = join(root, 'stingr-scout-hub');
  mkdirSync(release);
  writeFileSync(join(release, 'stingr-hub'), '#!/bin/sh\necho hub\n');
  writeFileSync(join(release, 'node'), 'not really node');
  writeFileSync(join(release, 'VERSION'), `${version}\n`);
  writeFileSync(join(release, 'icon.png'), 'png');
  copyFileSync(INSTALLER, join(release, 'install.sh'));
  const home = join(root, 'home');
  mkdirSync(home);
  return { root, release, home, base: join(home, '.local/share/stingr-scout') };
}

function run(script: string, home: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync('/bin/bash', [script, ...args], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, STINGR_SKIP_ADB: '1', ...env },
    encoding: 'utf8',
  });
}

describe('install.sh', () => {
  it('installs the program, the command and the menu entry', () => {
    const { release, home, base } = setup();
    const r = run(join(release, 'install.sh'), home);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Installed Stingr Scout hub v9.9.9.');
    expect(readFileSync(join(base, 'app/VERSION'), 'utf8')).toBe('v9.9.9\n');
    const cmd = join(home, '.local/bin/stingr-hub');
    expect(lstatSync(cmd).isSymbolicLink()).toBe(true);
    expect(realpathSync(cmd)).toBe(join(base, 'app/stingr-hub'));
    const desktop = readFileSync(join(home, '.local/share/applications/stingr-scout.desktop'), 'utf8');
    expect(desktop).toContain(`Exec=${cmd}`);
    expect(desktop).toContain(`Icon=${join(base, 'app/icon.png')}`);
    expect(desktop).toContain('Terminal=true');
  });

  it('upgrades without touching the data folder', () => {
    const { release, home, base } = setup();
    run(join(release, 'install.sh'), home);
    mkdirSync(join(base, 'data'), { recursive: true });
    writeFileSync(join(base, 'data/stingr.db'), 'precious');
    writeFileSync(join(release, 'VERSION'), 'v9.9.10\n');
    expect(run(join(release, 'install.sh'), home).status).toBe(0);
    expect(readFileSync(join(base, 'app/VERSION'), 'utf8')).toBe('v9.9.10\n');
    expect(readFileSync(join(base, 'data/stingr.db'), 'utf8')).toBe('precious');
    expect(existsSync(join(base, 'app.new'))).toBe(false);
    expect(existsSync(join(base, 'app.old'))).toBe(false);
  });

  it('can be re-run from the installed copy', () => {
    const { release, home, base } = setup();
    run(join(release, 'install.sh'), home);
    const r = run(join(base, 'app/install.sh'), home);
    expect(r.status).toBe(0);
    expect(readFileSync(join(base, 'app/VERSION'), 'utf8')).toBe('v9.9.9\n');
  });

  it('uninstalls but keeps the data', () => {
    const { release, home, base } = setup();
    run(join(release, 'install.sh'), home);
    mkdirSync(join(base, 'data'), { recursive: true });
    writeFileSync(join(base, 'data/stingr.db'), 'precious');
    const r = run(join(base, 'app/install.sh'), home, ['--uninstall']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Your scouting data is still in ${join(base, 'data')}`);
    expect(existsSync(join(base, 'app'))).toBe(false);
    expect(existsSync(join(home, '.local/bin/stingr-hub'))).toBe(false);
    expect(existsSync(join(home, '.local/share/applications/stingr-scout.desktop'))).toBe(false);
    expect(readFileSync(join(base, 'data/stingr.db'), 'utf8')).toBe('precious');
  });

  /** A PATH holding only the commands install.sh uses (so adb is absent), plus optional fake apt-get/sudo. */
  function minimalPath(root: string, withApt: boolean) {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    for (const cmd of ['dirname', 'uname', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'ln', 'cat', 'readlink']) {
      const real = ['/usr/bin', '/bin'].map(d => join(d, cmd)).find(p => existsSync(p));
      if (real) symlinkSync(real, join(bin, cmd));
    }
    if (withApt) {
      writeFileSync(join(bin, 'sudo'), '#!/bin/bash\n"$@"\n');
      writeFileSync(join(bin, 'apt-get'), `#!/bin/bash\necho "$@" > "${join(root, 'apt-args')}"\n`);
      chmodSync(join(bin, 'sudo'), 0o755);
      chmodSync(join(bin, 'apt-get'), 0o755);
    }
    return bin;
  }

  it('installs adb with apt when it is missing', () => {
    const { root, release, home } = setup();
    const bin = minimalPath(root, true);
    const r = run(join(release, 'install.sh'), home, [], { PATH: bin, STINGR_SKIP_ADB: '' });
    expect(r.status).toBe(0);
    expect(readFileSync(join(root, 'apt-args'), 'utf8').trim()).toBe('install -y adb');
  });

  it('explains what to do without apt', () => {
    const { root, release, home, base } = setup();
    const bin = minimalPath(root, false);
    const r = run(join(release, 'install.sh'), home, [], { PATH: bin, STINGR_SKIP_ADB: '' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('Please install adb');
    expect(existsSync(join(base, 'app'))).toBe(false); // nothing half-installed
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project node scripts/release/test/install.test.ts`
Expected: FAIL — `install.sh` does not exist (bash exits 127).

- [ ] **Step 3: Implement `scripts/release/install.sh`**

```bash
#!/usr/bin/env bash
# Installs or upgrades the Stingr Scout hub for the current user. Run it from the unpacked release folder:
#   ./install.sh               install or upgrade
#   ./install.sh --uninstall   remove the program (your scouting data is kept)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SHARE="${XDG_DATA_HOME:-$HOME/.local/share}"
BASE="$SHARE/stingr-scout"
APP="$BASE/app"
DATA="$BASE/data"
BIN_DIR="$HOME/.local/bin"
DESKTOP="$SHARE/applications/stingr-scout.desktop"

say() { printf '%s\n' "$*"; }

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$APP" "$BIN_DIR/stingr-hub" "$DESKTOP"
  say "Stingr Scout hub removed. Your scouting data is still in $DATA"
  exit 0
fi

if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
  say "This release is for 64-bit Linux on Intel/AMD (x86_64). This computer is $(uname -s) $(uname -m)."
  exit 1
fi

# adb lets the hub talk to tablets over USB.
if [ -z "${STINGR_SKIP_ADB:-}" ] && ! command -v adb >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    say "Installing adb (used to talk to the tablets over USB). You may be asked for your password."
    sudo apt-get install -y adb
  else
    say "Please install adb with your system's package manager, then run ./install.sh again."
    exit 1
  fi
fi

mkdir -p "$BASE" "$BIN_DIR" "$(dirname "$DESKTOP")"

# Copy the new version beside the old one, then swap, so a failed copy never leaves a half-installed hub.
# Works even when this script is the installed copy: it is copied before anything is replaced.
rm -rf "$APP.new" "$APP.old"
cp -R "$HERE" "$APP.new"
if [ -d "$APP" ]; then mv "$APP" "$APP.old"; fi
mv "$APP.new" "$APP"
rm -rf "$APP.old"
chmod +x "$APP/stingr-hub" "$APP/node" "$APP/install.sh"

ln -sf "$APP/stingr-hub" "$BIN_DIR/stingr-hub"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Stingr Scout Hub
Comment=Collect scouting data from the tablets
Exec=$BIN_DIR/stingr-hub
Icon=$APP/icon.png
Terminal=true
Categories=Utility;
EOF

say "Installed Stingr Scout hub $(cat "$APP/VERSION")."
say "Start it from your applications menu (Stingr Scout Hub) or by running: stingr-hub"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "(The stingr-hub command works in new terminal windows; until then use $BIN_DIR/stingr-hub)" ;;
esac
say "Your scouting data is kept in $DATA"
```

Run: `chmod +x scripts/release/install.sh`

- [ ] **Step 4: Run tests and typecheck, then commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add scripts/release/install.sh scripts/release/test/install.test.ts
git commit -m "feat(release): installer with upgrade, uninstall and automatic adb"
```

---

### Task 5: Packaging test — build, install, run, upgrade, uninstall

**Files:**
- Create: `vitest.package.config.ts`, `scripts/release/test/package.e2e.ts`
- Modify: `package.json` (`test:package` script)

**Interfaces:**
- Consumes: `buildRelease` (Task 3), `install.sh` (Task 4).
- Produces: `npm run test:package` — builds a real release with the local `node` (no download), installs it into a temporary home folder, starts it through `~/.local/bin/stingr-hub`, checks it, upgrades it, uninstalls it.

- [ ] **Step 1: Add the config and script**

`vitest.package.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['scripts/release/test/*.e2e.ts'], testTimeout: 300_000, hookTimeout: 300_000 },
});
```

Run: `npm pkg set scripts.test:package="vitest run --config vitest.package.config.ts"`

- [ ] **Step 2: Write the test**

`scripts/release/test/package.e2e.ts`:

```ts
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
```

- [ ] **Step 3: Run it**

Run: `npm run test:package`
Expected: 3 passed (the build output from `npm run build` scrolls past first).

- [ ] **Step 4: Build a real release with the pinned Node.js once**

Run: `npm run package -- --version v0.0.0-local && tar -tzf release/stingr-scout-hub-linux-x64.tar.gz | head -20 && ls -lh release/`
Expected: downloads Node.js 22.22.1 into `.cache/` (first time only), verifies its checksum, and lists `stingr-scout-hub/hub.mjs`, `node`, `stingr-hub`, `install.sh`, `icon.png`, `VERSION`, `README.txt`, `app/dist/…`, `hub/ui/dist/…`; the tarball is roughly 40–50 MB.

Then confirm the bundled runtime is the pinned one: `release/stingr-scout-hub/node --version` prints `v22.22.1`.

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.package.config.ts scripts/release/test/package.e2e.ts
git commit -m "test(release): build, install, run, upgrade and uninstall a real release"
```

---

### Task 6: GitHub Actions — tests on every push, releases on tags

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

**Interfaces:**
- Produces: CI runs typecheck, unit/component tests, end-to-end tests and the packaging test on pushes to `main` and on pull requests. Pushing a tag `vX.Y.Z` runs the same checks, builds the release with that version and publishes `stingr-scout-hub-linux-x64.tar.gz` on a GitHub Release named after the tag.

- [ ] **Step 1: Write the workflows**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.22.1
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - run: npm run test:package
```

`.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.22.1
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - run: npm run test:package
      - run: npm run package -- --version "$GITHUB_REF_NAME"
      - name: Publish the release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" release/stingr-scout-hub-linux-x64.tar.gz \
            --title "Stingr Scout $GITHUB_REF_NAME" --generate-notes
```

- [ ] **Step 2: Check the files parse as YAML**

Run: `node -e "for (const f of ['ci','release']) { const t = require('fs').readFileSync('.github/workflows/' + f + '.yml', 'utf8'); if (/\t/.test(t)) throw new Error(f + ' has tabs'); console.log(f, 'ok', t.split('\n').length, 'lines'); }"`
Expected: `ci ok …` and `release ok …`. (Actions syntax is checked for real when CI runs after the push in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: test every push; publish a release for every version tag"
```

---

### Task 7: README — installing and updating the hub, setting up tablets

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`** with:

````markdown
# Stingr Scout

Offline scouting for FRC Team 5098: Android tablets run a web app that syncs over a USB cable to a hub on a Linux laptop. No internet or Wi-Fi is needed at events.

## Installing the hub laptop

Needs 64-bit Ubuntu or Debian (or a derivative such as Mint or Pop!_OS).

1. Download `stingr-scout-hub-linux-x64.tar.gz` from the repository's **Releases** page (you must be signed in to GitHub, since the repository is private), or with the GitHub CLI:

   ```bash
   gh release download -R Altainia/stingr-scout --pattern 'stingr-scout-hub-linux-x64.tar.gz'
   ```

2. Unpack it and run the installer:

   ```bash
   tar -xzf stingr-scout-hub-linux-x64.tar.gz
   cd stingr-scout-hub
   ./install.sh
   ```

   It installs `adb` if needed (it may ask for your password), adds **Stingr Scout Hub** to the applications menu and a `stingr-hub` command.

3. Start **Stingr Scout Hub** from the applications menu. A terminal window shows the hub's messages and the hub opens in your browser at http://localhost:5098/hub/. Close the terminal window to stop the hub.

**Updating:** download the newer release and run its `./install.sh` the same way. Your scouting data stays in `~/.local/share/stingr-scout/data` and is never touched by installing or updating. Tablets pick up the new tablet app the next time they sync.

**Backing up:** use **Export & backup → Download backup** in the hub, and keep the file on a USB drive during events.

**Removing:** `~/.local/share/stingr-scout/app/install.sh --uninstall` (your data is kept).

## Setting up a tablet

1. On the tablet: Settings → About tablet → tap **Build number** 7 times, then Settings → Developer options → turn on **USB debugging**.
2. Start the hub and plug the tablet into the laptop. Accept **Allow USB debugging** on the tablet (tick "Always allow from this computer").
3. On the tablet open Chrome and go to `http://localhost:5098/`, then Chrome menu (⋮) → **Install app**.
4. Open **Stingr Scout** from the home screen, name the tablet and choose its usual position.

Each time a tablet is plugged in it syncs automatically: wait for the green **"Sync complete — safe to unplug"** screen.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm test            # unit, component and API tests
npm run typecheck
npm run build       # build the tablet app and hub screens
npm run hub         # start the hub at http://localhost:5098/hub/ (add `-- --no-open` to skip the browser)
npm run dev:app     # tablet app with live reload at http://localhost:5173 (talks to a hub on 5098)
npm run dev:hub-ui  # hub screens with live reload at http://localhost:5174/hub/ (talks to a hub on 5098)
npm run e2e         # end-to-end tests: real hub + Chromium
npm run package     # build release/stingr-scout-hub-linux-x64.tar.gz
npm run test:package  # build, install, run, upgrade and uninstall a release in a temporary home folder
```

Environment overrides for the hub: `STINGR_PORT`, `STINGR_DATA_DIR`, `STINGR_WEB_ROOT`, `STINGR_APP_BUILD`, `ADB`.

**Releasing:** push a tag such as `v0.2.0` (`git tag v0.2.0 && git push origin v0.2.0`). GitHub Actions tests it, builds the release and publishes it on the Releases page.

Design: `docs/superpowers/specs/2026-10-15-stingr-scout-design.md`
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: installing and updating the hub; setting up tablets"
```

---

### Task 8: First release and install on the hub laptop

**This task publishes to GitHub and needs the human partner** (at the intended hub laptop for Step 4).

- [ ] **Step 1: Ask before publishing.** Pushing `main`, creating a tag and publishing a release are outward-facing. Confirm with the human partner: push now? which version for the first release (suggest `v0.1.0`)?

- [ ] **Step 2: Push and watch CI**

```bash
git push origin main
gh run watch -R Altainia/stingr-scout --exit-status "$(gh run list -R Altainia/stingr-scout --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: the CI run succeeds. If it fails, read the log (`gh run view --log-failed`), fix the cause with a test where possible, and push again.

- [ ] **Step 3: Tag the release and watch it publish**

```bash
git tag v0.1.0
git push origin v0.1.0
gh run watch -R Altainia/stingr-scout --exit-status "$(gh run list -R Altainia/stingr-scout --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId')"
gh release view v0.1.0 -R Altainia/stingr-scout
```

Expected: the Release run succeeds and the release lists `stingr-scout-hub-linux-x64.tar.gz`.

- [ ] **Step 4: Human partner installs it on the hub laptop** following the README's "Installing the hub laptop", then: starts Stingr Scout Hub from the menu, plugs in the ZenPad, and confirms the tablet syncs and updates to the release's app version (tablet Settings → App version shows `v0.1.0`).

- [ ] **Step 5: Record and commit**

Write `docs/superpowers/notes/2026-10-16-first-release.md`: release URL, CI/Release run results, the hub laptop's OS version, install output and anything that needed fixing.

```bash
git add docs/superpowers/notes/2026-10-16-first-release.md
git commit -m "docs: first release installed on the hub laptop"
git push origin main
```
