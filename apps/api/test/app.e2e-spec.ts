import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Attendance & Task Management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let httpServer: import('http').Server;

  const adminEmail = 'e2e-admin@atms.local';
  const adminPassword = 'AdminPass123';
  const employeeEmail = 'e2e-employee@atms.local';
  const employeePassword = 'EmployeePass123';

  let adminAgent: ReturnType<typeof request.agent>;
  let employeeAgent: ReturnType<typeof request.agent>;
  let taskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    httpServer = app.getHttpServer();

    prisma = moduleFixture.get(PrismaService);

    // Isolated test database — safe to wipe between full test runs.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs" CASCADE');
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "correction_requests" CASCADE',
    );
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "task_time_entries" CASCADE',
    );
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "tasks" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "break_records" CASCADE');
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "attendance_sessions" CASCADE',
    );
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "refresh_tokens" CASCADE');
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "password_reset_tokens" CASCADE',
    );
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
    await prisma.appSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    const adminHash = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
    });
    await prisma.user.create({
      data: {
        firstName: 'E2E',
        surname: 'Admin',
        email: adminEmail,
        phoneNumber: '0000000001',
        passwordHash: adminHash,
        role: 'ADMINISTRATOR',
        status: 'ACTIVE',
      },
    });

    adminAgent = request.agent(httpServer);
    employeeAgent = request.agent(httpServer);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Registration and approval (EP-001)', () => {
    it('registers a new employee as PENDING by default', async () => {
      const res = await request(httpServer).post('/api/v1/auth/register').send({
        firstName: 'E2E',
        surname: 'Employee',
        email: employeeEmail,
        phoneNumber: '0000000002',
        password: employeePassword,
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
    });

    it('rejects duplicate email registration', async () => {
      const res = await request(httpServer).post('/api/v1/auth/register').send({
        firstName: 'Dup',
        surname: 'User',
        email: employeeEmail,
        phoneNumber: '0000000003',
        password: employeePassword,
      });
      expect(res.status).toBe(409);
    });

    it('a pending user cannot log in', async () => {
      const res = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: employeeEmail, password: employeePassword });
      expect(res.status).toBe(401);
    });

    it('admin logs in and approves the pending employee', async () => {
      const login = await adminAgent
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password: adminPassword });
      expect(login.status).toBe(200);

      const pending = await adminAgent
        .get('/api/v1/users')
        .query({ status: 'PENDING' });
      expect(pending.body).toHaveLength(1);

      const approve = await adminAgent.post(
        `/api/v1/users/${pending.body[0].id}/approve`,
      );
      expect(approve.status).toBe(201);
      expect(approve.body.status).toBe('ACTIVE');
    });

    it('the now-active employee can log in', async () => {
      const res = await employeeAgent
        .post('/api/v1/auth/login')
        .send({ email: employeeEmail, password: employeePassword });
      expect(res.status).toBe(200);
    });
  });

  describe('RBAC (NFR / US-012-002)', () => {
    it('blocks an employee from an administrator-only endpoint', async () => {
      const res = await employeeAgent.get('/api/v1/reports/attendance').query({
        from: '2020-01-01',
        to: '2020-01-02',
      });
      expect(res.status).toBe(403);
    });

    it('blocks unauthenticated access entirely', async () => {
      const res = await request(httpServer).get('/api/v1/users/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Core workflow: clock in, task time, break, reconciliation (BR-001..BR-010)', () => {
    it('admin creates and assigns a task', async () => {
      const me = await employeeAgent.get('/api/v1/users/me');
      const employeeId = me.body.id;

      const res = await adminAgent.post('/api/v1/tasks').send({
        title: 'E2E task',
        priority: 'HIGH',
        assigneeId: employeeId,
      });
      expect(res.status).toBe(201);
      taskId = res.body.id;
    });

    it('employee clocks in', async () => {
      const res = await employeeAgent.post('/api/v1/attendance/clock-in');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('rejects a second concurrent clock-in (BR-002)', async () => {
      const res = await employeeAgent.post('/api/v1/attendance/clock-in');
      expect(res.status).toBe(409);
    });

    it('starts a task timer', async () => {
      const res = await employeeAgent
        .post('/api/v1/task-timers/start')
        .send({ taskId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('RUNNING');
    });

    it('rejects a second concurrent task timer (BR-003)', async () => {
      const res = await employeeAgent
        .post('/api/v1/task-timers/start')
        .send({ taskId });
      expect(res.status).toBe(409);
    });

    it('starting a break pauses the active task timer (BR-005)', async () => {
      const res = await employeeAgent.post('/api/v1/breaks/start');
      expect(res.status).toBe(200);
      expect(res.body.pausedTask.id).toBe(taskId);

      const state = await employeeAgent.get('/api/v1/attendance/state');
      expect(state.body.state).toBe('ON_BREAK');
      expect(state.body.activeTimer).toBeNull();
    });

    it('cannot start a task timer while on break', async () => {
      const res = await employeeAgent
        .post('/api/v1/task-timers/start')
        .send({ taskId });
      expect(res.status).toBe(400);
    });

    it('ending a break does not auto-resume the task (BR-006)', async () => {
      const res = await employeeAgent.post('/api/v1/breaks/end');
      expect(res.status).toBe(200);

      const state = await employeeAgent.get('/api/v1/attendance/state');
      expect(state.body.state).toBe('WORKING');
      expect(state.body.activeTimer).toBeNull();
    });

    it('resumes the task after the break', async () => {
      const res = await employeeAgent
        .post('/api/v1/task-timers/resume')
        .send({ taskId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('RUNNING');
    });

    it('clock-out requires confirmation while a task timer is running (BR-007)', async () => {
      const res = await employeeAgent
        .post('/api/v1/attendance/clock-out')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.requiresConfirmation).toBe(true);
      expect(res.body.activeTimer).toBeTruthy();
    });

    it('confirmed clock-out stops the timer and completes the session at one boundary', async () => {
      const res = await employeeAgent
        .post('/api/v1/attendance/clock-out')
        .send({ confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.requiresConfirmation).toBe(false);
      expect(res.body.session.status).toBe('COMPLETED');

      const state = await employeeAgent.get('/api/v1/attendance/state');
      expect(state.body.state).toBe('CLOCKED_OUT');
    });

    it('reconciliation reflects net working time, task time and unallocated time (BR-008..BR-010)', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await employeeAgent
        .get('/api/v1/reconciliation/me')
        .query({ date: today });
      expect(res.status).toBe(200);
      expect(res.body.netWorkingMinutes).toBeGreaterThanOrEqual(0);
      expect(res.body.taskMinutes).toBeGreaterThanOrEqual(0);
      expect(res.body.hasDataQualityException).toBe(false);
      // Net working time includes the whole clocked-in period (break included in gross,
      // subtracted separately), so it must be >= task time for a clean day.
      expect(res.body.netWorkingMinutes).toBeGreaterThanOrEqual(
        res.body.taskMinutes,
      );
    });
  });

  describe('Corrections and audit trail (EP-009)', () => {
    it('employee requests a correction and admin approves it, preserving audit history', async () => {
      const history = await employeeAgent.get('/api/v1/attendance/me');
      const sessionId = history.body[0].id;
      const originalClockIn = history.body[0].clockInAt;

      const request_ = await employeeAgent.post('/api/v1/corrections').send({
        targetType: 'ATTENDANCE_SESSION',
        targetId: sessionId,
        proposedStart: new Date(
          new Date(originalClockIn).getTime() - 60_000,
        ).toISOString(),
        reason: 'Clocked in a minute earlier than recorded',
      });
      expect(request_.status).toBe(201);

      const decide = await adminAgent
        .post(`/api/v1/corrections/${request_.body.id}/decide`)
        .send({ approve: true, comment: 'Confirmed with manager' });
      expect(decide.status).toBe(201);
      expect(decide.body.status).toBe('APPROVED');

      const audit = await adminAgent
        .get('/api/v1/audit')
        .query({ action: 'CORRECTION_APPROVED' });
      expect(audit.body.length).toBeGreaterThan(0);
    });
  });

  describe('Task detail is not organisation-wide visible (data isolation)', () => {
    it('an employee cannot view a task assigned to a different employee', async () => {
      const otherAgent = request.agent(httpServer);
      const otherEmail = 'e2e-other-employee@atms.local';
      const otherHash = await argon2.hash('OtherPass123', {
        type: argon2.argon2id,
      });
      await prisma.user.create({
        data: {
          firstName: 'Other',
          surname: 'Employee',
          email: otherEmail,
          phoneNumber: '0000000004',
          passwordHash: otherHash,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
      const login = await otherAgent
        .post('/api/v1/auth/login')
        .send({ email: otherEmail, password: 'OtherPass123' });
      expect(login.status).toBe(200);

      const blocked = await otherAgent.get(`/api/v1/tasks/${taskId}`);
      expect(blocked.status).toBe(403);

      const allowed = await employeeAgent.get(`/api/v1/tasks/${taskId}`);
      expect(allowed.status).toBe(200);

      const adminView = await adminAgent.get(`/api/v1/tasks/${taskId}`);
      expect(adminView.status).toBe(200);
    });
  });

  describe('Settings updates are validated, not mass-assigned', () => {
    it('rejects an unknown/extra field instead of writing it through', async () => {
      const res = await adminAgent.patch('/api/v1/settings').send({
        employeesCanCreateTasks: false,
        id: 'not-default', // must never be able to override the singleton row's id
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('default');
      expect(res.body.employeesCanCreateTasks).toBe(false);
    });

    it('rejects an invalid value with a 400', async () => {
      const res = await adminAgent.patch('/api/v1/settings').send({
        sessionInactivityTimeoutMinutes: -5,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Logout invalidates the session (US-001-004)', () => {
    it('protected endpoints are unreachable after logout', async () => {
      const logoutAgent = request.agent(httpServer);
      await logoutAgent
        .post('/api/v1/auth/login')
        .send({ email: employeeEmail, password: employeePassword });
      const before = await logoutAgent.get('/api/v1/users/me');
      expect(before.status).toBe(200);

      await logoutAgent.post('/api/v1/auth/logout');
      const afterLogout = await logoutAgent.post('/api/v1/auth/refresh');
      expect(afterLogout.status).toBe(401);
    });

    it('logout succeeds even with no access token present (only the refresh cookie)', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/api/v1/auth/login')
        .send({ email: employeeEmail, password: employeePassword });
      await agent.jar.setCookie('atms_access=; Max-Age=0; Path=/');

      const res = await agent.post('/api/v1/auth/logout');
      expect(res.status).toBe(200);

      const afterLogout = await agent.post('/api/v1/auth/refresh');
      expect(afterLogout.status).toBe(401);
    });
  });
});
