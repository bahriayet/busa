import { defineConfig } from '@playwright/test';

/**
 * E2E memakai Microsoft Edge yang sudah terpasang (channel 'msedge'),
 * jadi tidak perlu mengunduh browser Chromium tambahan.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1366, height: 700 },
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
