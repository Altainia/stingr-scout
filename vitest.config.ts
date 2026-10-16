import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['shared/**/*.test.ts', 'hub/server/**/*.test.ts', 'scripts/**/*.test.ts'] } },
      './app/vite.config.ts',
      './hub/ui/vite.config.ts',
    ],
  },
});
