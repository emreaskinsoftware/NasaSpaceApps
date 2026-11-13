import { defineConfig } from '@playwright/test';
/** E2E runs against the production build served by `vite preview` in Chrome, Firefox and WebKit. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'npx vite preview --config apps/web/vite.config.ts', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 60_000 },
});
