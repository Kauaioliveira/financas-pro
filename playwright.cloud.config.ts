import { defineConfig } from '@playwright/test';

// Cloud-mode E2E against a simulated Supabase (e2e-cloud/mockSupabase.ts). Not part of CI:
// CI tests the local mode. Run with `npm run test:e2e:cloud`
// (PW_CHANNEL=chrome uses an installed Chrome instead of Playwright's browser).
const MOCK_URL = 'http://127.0.0.1:54321';

export default defineConfig({
  testDir: './e2e-cloud',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4174',
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    // Same reason as the local config: the worker must not serve cached files to the tests.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npx vite build --outDir dist-cloud-test --emptyOutDir && npx vite preview --outDir dist-cloud-test --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: MOCK_URL,
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_e2e_mock',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
