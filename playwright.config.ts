import { defineConfig, devices } from '@playwright/test';
import crypto from 'node:crypto';

// one admin password per test run, shared with the isolated server below
process.env.E2E_ADMIN_PASSWORD ??= crypto.randomBytes(12).toString('base64url');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://localhost:3100/api/products',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: '3100',
      ATELIER_DATA_DIR: 'data-e2e',
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
      ADMIN_SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    },
  },
});
