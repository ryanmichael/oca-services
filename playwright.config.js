'use strict';

const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT || 3098);

module.exports = defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node server.js`,
    url: `http://localhost:${PORT}`,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
