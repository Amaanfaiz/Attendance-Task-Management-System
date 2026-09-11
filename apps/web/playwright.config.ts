import { defineConfig, devices } from '@playwright/test';

// SRS §14 Testing Strategy: "End-to-end Playwright tests for Register -> Login
// -> Clock In -> Task -> Break -> Switch -> Clock Out." Runs against a real,
// already-running stack (web + api + Postgres) rather than trying to manage
// the multi-service startup itself - see .github/workflows/ci.yml's
// playwright-e2e job for how that stack gets brought up in CI, or run
// `docker compose up -d --build` locally first.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
