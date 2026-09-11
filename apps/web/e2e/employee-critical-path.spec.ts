import { test, expect } from '@playwright/test';
import { adminApiContext, uniqueEmail } from './helpers';

// SRS §14: "End-to-end Playwright tests for Register -> Login -> Clock In ->
// Task -> Break -> Switch -> Clock Out." (RISK-010). Approving the new
// registration and assigning tasks is done via the real API as setup - that's
// the admin's action, not part of the employee's own critical path being
// exercised here - but every step of the employee's actual flow below runs
// through the real browser, clicking the real UI, exactly as the SRS names it.
test('Register -> Login -> Clock In -> Task -> Break -> Switch -> Clock Out -> Reconciliation', async ({ page }) => {
  const email = uniqueEmail('e2e-employee');
  const password = 'PlaywrightTest123';

  // --- Register (real browser) ---
  await page.goto('/register');
  await page.getByLabel('First name').fill('Playwright');
  await page.getByLabel('Surname').fill('Employee');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone number').fill('5551234567');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByText('An administrator must approve your account')).toBeVisible();

  // --- Admin approves + assigns two tasks (setup, via API) ---
  const admin = await adminApiContext();
  const usersRes = await admin.get('/api/v1/users', { params: { status: 'PENDING' } });
  const pendingUsers = (await usersRes.json()) as Array<{ id: string; email: string }>;
  const newUser = pendingUsers.find((u) => u.email === email);
  if (!newUser) throw new Error(`Registered user ${email} not found in PENDING list`);
  const approveRes = await admin.post(`/api/v1/users/${newUser.id}/approve`);
  expect(approveRes.ok()).toBeTruthy();

  const task1Res = await admin.post('/api/v1/tasks', {
    data: { title: 'Playwright task one - development', assigneeId: newUser.id },
  });
  expect(task1Res.ok()).toBeTruthy();
  const task1 = (await task1Res.json()) as { id: string; title: string };
  const task2Res = await admin.post('/api/v1/tasks', {
    data: { title: 'Playwright task two - testing', assigneeId: newUser.id },
  });
  expect(task2Res.ok()).toBeTruthy();
  const task2 = (await task2Res.json()) as { id: string; title: string };
  await admin.dispose();

  // --- Login (real browser) ---
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/my-day/);

  const main = page.getByRole('main');

  // --- Clock In ---
  await page.getByRole('button', { name: 'Clock In' }).click();
  await expect(main.getByText('Working', { exact: true })).toBeVisible();

  // --- Start task one's timer ---
  const task1Row = page.getByRole('listitem').filter({ hasText: task1.title });
  await task1Row.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText(task1.title).first()).toBeVisible();
  await expect(task1Row.getByText('Active')).toBeVisible();

  // --- Break auto-pauses the running timer ---
  await page.getByRole('button', { name: 'Start Break' }).click();
  await expect(main.getByText('On break', { exact: true })).toBeVisible();
  await expect(page.getByText('Clock in (and end any break) to start a task timer.')).toBeVisible();

  // --- End break does NOT auto-resume (BR-006) - explicit Resume required ---
  await page.getByRole('button', { name: 'End Break' }).click();
  await expect(main.getByText('Working', { exact: true })).toBeVisible();
  await expect(page.getByText('No task timer running. Start one below.')).toBeVisible();
  await task1Row.getByRole('button', { name: 'Resume' }).click();
  await expect(task1Row.getByText('Active')).toBeVisible();

  // --- Switch to task two ---
  const task2Row = page.getByRole('listitem').filter({ hasText: task2.title });
  await task2Row.getByRole('button', { name: 'Switch to this' }).click();
  await expect(task2Row.getByText('Active')).toBeVisible();
  await expect(task1Row.getByText('Active')).not.toBeVisible();

  // --- Stop the timer ---
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('No task timer running. Start one below.')).toBeVisible();

  // --- Clock Out ---
  await page.getByRole('button', { name: 'Clock Out' }).click();
  await expect(main.getByText('Clocked out', { exact: true })).toBeVisible();

  // --- Review the day: attendance/task-time reconciliation is visible and non-zero ---
  await expect(page.getByText('Today\'s Totals')).toBeVisible();
  const workedStat = page.locator('text=Worked').locator('..').getByText(/\d+h \d+m|\d+m/);
  await expect(workedStat).toBeVisible();
  const taskTimeStat = page.locator('text=Task time').locator('..').getByText(/\d+h \d+m|\d+m/);
  await expect(taskTimeStat).toBeVisible();
});
