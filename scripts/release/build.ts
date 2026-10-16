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
