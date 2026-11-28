// Settings for the automatic tests (run on GitHub on every push).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // one at a time: the update test changes what the server sends
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/gym-tracker/',
    viewport: { width: 360, height: 760 },
    trace: 'off',
  },
  webServer: {
    command: 'node tests/serve.js',
    url: 'http://localhost:4173/gym-tracker/',
    reuseExistingServer: !process.env.CI,
  },
});
