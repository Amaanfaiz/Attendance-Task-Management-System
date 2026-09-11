import { test, expect } from '@playwright/test';
import { request } from '@playwright/test';
import { adminApiContext, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, uniqueEmail } from './helpers';

// SRS §1 administrator workflow: "Manage Users -> Create/Assign Tasks -> View
// Live Attendance -> Review Logs -> Correct Exceptions -> Run Reports"
// (RISK-010). Seeding a real pending correction is done via the API as setup
// (an employee requesting one isn't the admin flow being tested here), but
// every admin action below - approving it, running a report, reading the
// audit log - runs through the real browser against the real deployed UI.
test('Admin: Live Attendance -> approve a correction -> run a report -> audit log', async ({ page }) => {
  // --- Setup: a disposable employee clocks in/out, then requests a correction ---
  const admin = await adminApiContext();
  const email = uniqueEmail('e2e-admin-flow-employee');
  const password = 'PlaywrightTest123';

  const registerCtx = await request.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000' });
  await registerCtx.post('/api/v1/auth/register', {
    data: { firstName: 'Playwright', surname: 'AdminFlow', email, phoneNumber: '5559876543', password },
  });

  const usersRes = await admin.get('/api/v1/users', { params: { status: 'PENDING' } });
  const pendingUsers = (await usersRes.json()) as Array<{ id: string; email: string }>;
  const newUser = pendingUsers.find((u) => u.email === email);
  if (!newUser) throw new Error(`Registered user ${email} not found in PENDING list`);
  await admin.post(`/api/v1/users/${newUser.id}/approve`);

  const employeeCtx = await request.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000' });
  await employeeCtx.post('/api/v1/auth/login', { data: { email, password } });
  const clockInRes = await employeeCtx.post('/api/v1/attendance/clock-in');
  const session = (await clockInRes.json()) as { id: string };
  await employeeCtx.post('/api/v1/attendance/clock-out');

  const correctionReason = `Playwright admin-flow correction ${Date.now()}`;
  const correctionRes = await employeeCtx.post('/api/v1/corrections', {
    data: {
      targetType: 'ATTENDANCE_SESSION',
      targetId: session.id,
      reason: correctionReason,
      proposedStart: new Date(Date.now() - 8 * 60 * 60_000).toISOString(),
    },
  });
  expect(correctionRes.ok()).toBeTruthy();
  await employeeCtx.dispose();
  await admin.dispose();
  await registerCtx.dispose();

  // --- Admin logs in through the real browser ---
  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(SEED_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/my-day/);

  // --- View Live Attendance ---
  await page.goto('/admin/live');
  await expect(page.getByRole('heading', { name: 'Live Attendance' })).toBeVisible();

  // --- Review Logs / Correct Exceptions: approve the seeded correction ---
  await page.goto('/admin/corrections');
  const correctionItem = page.getByRole('listitem').filter({ hasText: correctionReason });
  await expect(correctionItem).toBeVisible();
  await correctionItem.getByRole('button', { name: 'Approve' }).click();
  await expect(correctionItem).not.toBeVisible();

  // --- Run Reports ---
  await page.goto('/admin/reports');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByRole('region', { name: 'Daily Attendance table' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'employee' })).toBeVisible();

  // --- Audit log shows the correction approval we just performed ---
  await page.goto('/admin/audit');
  await expect(page.getByRole('cell', { name: /CORRECTION_APPROVED/i }).first()).toBeVisible();
});
