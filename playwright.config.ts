import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    // The build ships a service worker; letting it cache between tests would hide
    // regressions behind stale files. e2e/pwa.spec.ts turns it back on for itself.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
