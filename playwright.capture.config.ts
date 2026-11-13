import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/capture', timeout: 180_000, workers: 1, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 },
  webServer: { command: 'npx vite preview --config apps/web/vite.config.ts', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 60_000 },
});
