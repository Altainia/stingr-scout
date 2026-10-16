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
