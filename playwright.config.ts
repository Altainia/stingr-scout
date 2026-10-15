import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 5199;
const dataDir = mkdtempSync(join(tmpdir(), 'stingr-e2e-'));

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npm run build && npx tsx hub/server/src/main.ts --no-open',
    url: `http://127.0.0.1:${PORT}/api/ping`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(process.env as Record<string, string>),
      STINGR_PORT: String(PORT),
      STINGR_DATA_DIR: dataDir,
      STINGR_APP_BUILD: 'e2e',
      ADB: 'false', // never touch a real tablet from tests
    },
  },
});
