import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a production build (`npm run build`) and a local Supabase stack
 * (`supabase start`) – see .github/workflows/e2e.yml and docs/PHASE-10.md. Never point them
 * at the production database: they create bookings, accounts and audit records.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'sk-SK',
    timezoneId: 'Europe/Bratislava',
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
})
