import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/hub/',
  plugins: [svelte()],
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:5098' } },
  test: {
    name: 'hub-ui',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['@testing-library/svelte/vitest'],
    // Packages are hoisted to the repo root, outside this project; let Vite compile their .svelte.js files.
    server: { deps: { inline: [/@testing-library\/svelte/] } },
  },
});
