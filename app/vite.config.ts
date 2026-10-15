import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const BUILD_ID = process.env.STINGR_APP_BUILD ?? new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** After a build: write build.json and a service worker that precaches every built file. */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'stingr-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map(f => relative(outDir, f).split('\\').join('/'))
        .filter(f => f !== 'sw.js' && f !== 'build.json')
        .sort();
      const template = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), template.replace('__BUILD_ID__', BUILD_ID).replace('__PRECACHE__', JSON.stringify(['./', ...files])));
      writeFileSync(join(outDir, 'build.json'), JSON.stringify({ build: BUILD_ID }));
    },
  };
}

export default defineConfig({
  plugins: [svelte(), serviceWorker()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  build: { target: 'chrome119' },
  server: { proxy: { '/api': 'http://127.0.0.1:5098' } },
  test: {
    name: 'app',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
    // Packages are hoisted to the repo root, outside this project; let Vite compile their .svelte.js files.
    server: { deps: { inline: [/@testing-library\/svelte/] } },
  },
});
