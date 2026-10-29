import { defineConfig } from '@playwright/test';

/**
 * Default E2E memakai Microsoft Edge yang sudah terpasang (channel 'msedge'),
 * jadi tidak perlu mengunduh browser Chromium tambahan.
 *
 * Di Linux/macOS atau CI, pasang Chromium lalu set:
 *   PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
 */
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel,
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
