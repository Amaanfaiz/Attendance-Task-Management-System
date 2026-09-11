import { APIRequestContext, request } from '@playwright/test';

// Matches the seeded accounts from apps/api/prisma/seed.ts's defaults - CI and
// local docker-compose both run `npm run prisma:seed` with no overrides before
// these tests execute.
export const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@atms.local';
export const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!Change';

const API_BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// Setup-only helper: logs in as the seeded admin via the real API (not the UI)
// so tests can arrange data (approve a user, create/assign tasks) without
// spending the actual test on driving an admin login twice. The employee
// critical-path test still drives every one of its own steps through the
// browser - this is only ever used for out-of-band setup.
export async function adminApiContext(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { 'Content-Type': 'application/json' } });
  const res = await ctx.post('/api/v1/auth/login', {
    data: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`Admin API login failed: ${res.status()} ${await res.text()}`);
  }
  return ctx;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@atms.app`;
}
