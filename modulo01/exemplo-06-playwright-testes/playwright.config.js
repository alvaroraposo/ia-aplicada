const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 5000,
  expect: {
    timeout: 5000,
  },
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'https://erickwendel.github.io',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5000,
    navigationTimeout: 5000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
