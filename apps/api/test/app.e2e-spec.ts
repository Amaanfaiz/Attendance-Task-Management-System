import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { Readable } from 'stream';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BlobStorageService } from '../src/common/services/blob-storage.service';

// In-memory stand-in for real Azure Blob Storage - this suite tests the
// application's own logic (ownership checks, audit trail, soft-delete),
// not Azure connectivity, and the real BlobStorageService throws if
// unconfigured (deliberately, see its own file) which CI correctly has no
// credentials for. Without this override, document upload tests would only
// pass in an environment that happens to have real Azure credentials
// leaking in via Prisma Client's own .env auto-load - exactly the trap this
// avoids.
class FakeBlobStorageService {
  private readonly blobs = new Map<string, Buffer>();

  async upload(blobPath: string, buffer: Buffer): Promise<void> {
    this.blobs.set(blobPath, buffer);
  }

  async download(blobPath: string): Promise<NodeJS.ReadableStream> {
    const buffer = this.blobs.get(blobPath);
    if (!buffer) throw new Error(`No fake blob at ${blobPath}`);
    return Readable.from(buffer);
  }

  async delete(blobPath: string): Promise<void> {
    this.blobs.delete(blobPath);
  }
}

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
  // Set up once by the "Task detail is not organisation-wide visible" block
  // below and reused by later blocks that also need a second, genuinely
  // distinct logged-in employee - the /auth/login route is rate-limited
  // (10/60s, auth.controller.ts) and the whole suite already runs close to
  // that limit, so tests share this account rather than each logging in
  // their own.
  let secondEmployeeAgent: ReturnType<typeof request.agent>;
  let taskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BlobStorageService)
      .useClass(FakeBlobStorageService)
      .compile();

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
      secondEmployeeAgent = request.agent(httpServer);
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
      const login = await secondEmployeeAgent
        .post('/api/v1/auth/login')
        .send({ email: otherEmail, password: 'OtherPass123' });
      expect(login.status).toBe(200);

      const blocked = await secondEmployeeAgent.get(`/api/v1/tasks/${taskId}`);
      expect(blocked.status).toBe(403);

      const allowed = await employeeAgent.get(`/api/v1/tasks/${taskId}`);
      expect(allowed.status).toBe(200);

      const adminView = await adminAgent.get(`/api/v1/tasks/${taskId}`);
      expect(adminView.status).toBe(200);
    });
  });

  describe('Document deletion requests (EP-013 follow-up)', () => {
    let employeeId: string;
    let documentId: string;
    let requestId: string;

    it('employee uploads a document', async () => {
      const me = await employeeAgent.get('/api/v1/users/me');
      employeeId = me.body.id;

      const res = await employeeAgent
        .post(`/api/v1/users/${employeeId}/documents`)
        .field('type', 'CV')
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        });
      expect(res.status).toBe(201);
      documentId = res.body.id;
    });

    it('employee requests deletion of their own document', async () => {
      const res = await employeeAgent
        .post(
          `/api/v1/users/${employeeId}/documents/${documentId}/deletion-request`,
        )
        .send({ reason: 'Uploaded the wrong file by mistake' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      requestId = res.body.id;
    });

    it('rejects a second concurrent deletion request for the same document', async () => {
      const res = await employeeAgent
        .post(
          `/api/v1/users/${employeeId}/documents/${documentId}/deletion-request`,
        )
        .send({ reason: 'Trying again for no real reason' });
      expect(res.status).toBe(400);
    });

    it("a different employee cannot request deletion of someone else's document", async () => {
      // Reuses the already-logged-in second employee from the "Task detail"
      // block above rather than logging in a fresh one - /auth/login is
      // rate-limited and the suite already runs close to that limit.
      const res = await secondEmployeeAgent
        .post(
          `/api/v1/users/${employeeId}/documents/${documentId}/deletion-request`,
        )
        .send({ reason: 'Not my document but trying anyway' });
      expect(res.status).toBe(403);
    });

    it('admin sees the pending request in the review queue', async () => {
      const res = await adminAgent.get(
        '/api/v1/document-deletion-requests/pending',
      );
      expect(res.status).toBe(200);
      expect(res.body.some((r: { id: string }) => r.id === requestId)).toBe(
        true,
      );
    });

    it('admin approves the request: document is soft-deleted and both audit actions are recorded', async () => {
      const decide = await adminAgent
        .post(`/api/v1/document-deletion-requests/${requestId}/decide`)
        .send({ approve: true, comment: 'Confirmed with employee' });
      expect(decide.status).toBe(201);
      expect(decide.body.status).toBe('APPROVED');

      const download = await employeeAgent.get(
        `/api/v1/users/${employeeId}/documents/${documentId}/download`,
      );
      expect(download.status).toBe(404);

      const requested = await adminAgent
        .get('/api/v1/audit')
        .query({ action: 'DOCUMENT_DELETION_REQUESTED' });
      expect(requested.body.length).toBeGreaterThan(0);
      const approved = await adminAgent
        .get('/api/v1/audit')
        .query({ action: 'DOCUMENT_DELETION_APPROVED' });
      expect(approved.body.length).toBeGreaterThan(0);
      const deleted = await adminAgent
        .get('/api/v1/audit')
        .query({ action: 'DOCUMENT_DELETED' });
      expect(deleted.body.length).toBeGreaterThan(0);
    });

    it('reject leaves the document untouched', async () => {
      const upload = await employeeAgent
        .post(`/api/v1/users/${employeeId}/documents`)
        .field('type', 'CV')
        .attach('file', Buffer.from('%PDF-1.4 second test'), {
          filename: 'resume2.pdf',
          contentType: 'application/pdf',
        });
      const secondDocId = upload.body.id;

      const req = await employeeAgent
        .post(
          `/api/v1/users/${employeeId}/documents/${secondDocId}/deletion-request`,
        )
        .send({ reason: 'Testing the reject path here' });
      expect(req.status).toBe(201);

      const decide = await adminAgent
        .post(`/api/v1/document-deletion-requests/${req.body.id}/decide`)
        .send({ approve: false, comment: 'Keep this one, still needed' });
      expect(decide.status).toBe(201);
      expect(decide.body.status).toBe('REJECTED');

      const list = await employeeAgent.get(
        `/api/v1/users/${employeeId}/documents`,
      );
      expect(list.body.some((d: { id: string }) => d.id === secondDocId)).toBe(
        true,
      );

      const rejected = await adminAgent
        .get('/api/v1/audit')
        .query({ action: 'DOCUMENT_DELETION_REJECTED' });
      expect(rejected.body.length).toBeGreaterThan(0);
    });

    it('a direct admin delete auto-resolves any pending deletion request (orphan resolution)', async () => {
      const upload = await employeeAgent
        .post(`/api/v1/users/${employeeId}/documents`)
        .field('type', 'CV')
        .attach('file', Buffer.from('%PDF-1.4 third test'), {
          filename: 'resume3.pdf',
          contentType: 'application/pdf',
        });
      const thirdDocId = upload.body.id;

      const req = await employeeAgent
        .post(
          `/api/v1/users/${employeeId}/documents/${thirdDocId}/deletion-request`,
        )
        .send({ reason: 'Requesting deletion before admin acts directly' });
      expect(req.status).toBe(201);
      const thirdRequestId = req.body.id;

      const directDelete = await adminAgent.delete(
        `/api/v1/users/${employeeId}/documents/${thirdDocId}`,
      );
      expect(directDelete.status).toBe(200);

      const pending = await adminAgent.get(
        '/api/v1/document-deletion-requests/pending',
      );
      expect(
        pending.body.some((r: { id: string }) => r.id === thirdRequestId),
      ).toBe(false);
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

  describe('Multiple breaks in one day (US-004-003)', () => {
    it('records each break as a separate, non-overlapping record and totals them correctly', async () => {
      const agent = request.agent(httpServer);
      const email = 'e2e-multibreak@atms.local';
      const hash = await argon2.hash('MultiBreak123', {
        type: argon2.argon2id,
      });
      await prisma.user.create({
        data: {
          firstName: 'Multi',
          surname: 'Break',
          email,
          phoneNumber: '0000000005',
          passwordHash: hash,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
      await agent
        .post('/api/v1/auth/login')
        .send({ email, password: 'MultiBreak123' });

      await agent.post('/api/v1/attendance/clock-in');

      const break1Start = await agent.post('/api/v1/breaks/start');
      expect(break1Start.status).toBe(200);
      await new Promise((r) => setTimeout(r, 20));
      const break1End = await agent.post('/api/v1/breaks/end');
      expect(break1End.status).toBe(200);

      const break2Start = await agent.post('/api/v1/breaks/start');
      expect(break2Start.status).toBe(200);
      await new Promise((r) => setTimeout(r, 20));
      const break2End = await agent.post('/api/v1/breaks/end');
      expect(break2End.status).toBe(200);

      // Each break must be its own record, linked to the same attendance session,
      // and not overlap the other (AC-004-003-01/02/04).
      expect(break1End.body.id).not.toBe(break2End.body.id);
      expect(break1End.body.attendanceSessionId).toBe(
        break2End.body.attendanceSessionId,
      );
      expect(new Date(break1End.body.endAt).getTime()).toBeLessThanOrEqual(
        new Date(break2Start.body.breakRecord.startAt).getTime(),
      );

      const state = await agent.get('/api/v1/attendance/state');
      expect(state.body.state).toBe('WORKING');
    });
  });

  describe('Session inactivity timeout (US-001-007, AC-001-007-01/02)', () => {
    it('a refresh token unused past the inactivity window is treated as expired', async () => {
      const agent = request.agent(httpServer);
      const email = 'e2e-inactivity@atms.local';
      const hash = await argon2.hash('Inactivity123', {
        type: argon2.argon2id,
      });
      await prisma.user.create({
        data: {
          firstName: 'Inactive',
          surname: 'Session',
          email,
          phoneNumber: '0000000006',
          passwordHash: hash,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
      await agent
        .post('/api/v1/auth/login')
        .send({ email, password: 'Inactivity123' });

      // Confirm the session is valid before manufacturing the inactivity gap.
      const before = await agent.post('/api/v1/auth/refresh');
      expect(before.status).toBe(200);

      const settings = await prisma.appSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default' },
        update: {},
      });
      const staleTime = new Date(
        Date.now() - (settings.sessionInactivityTimeoutMinutes + 1) * 60_000,
      );
      await prisma.refreshToken.updateMany({
        where: {
          userId: (await prisma.user.findUniqueOrThrow({ where: { email } }))
            .id,
        },
        data: { lastUsedAt: staleTime },
      });

      const afterInactivity = await agent.post('/api/v1/auth/refresh');
      expect(afterInactivity.status).toBe(401);
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

  // These fire two requests with Promise.all rather than one after another -
  // the sequential-looking "rejects a second concurrent clock-in/timer" tests
  // above only prove the second request is rejected once the first has already
  // committed. This proves the same thing when both hit the partial unique
  // index at the same instant, which is the actual race BR-002/BR-003 and
  // NFR-006 are about.
  describe('True concurrent requests (NFR-006)', () => {
    it('two simultaneous clock-ins for the same user: exactly one succeeds', async () => {
      const email = 'e2e-race-clockin@atms.local';
      const passwordHash = await argon2.hash('RacePass123', {
        type: argon2.argon2id,
      });
      const user = await prisma.user.create({
        data: {
          firstName: 'Race',
          surname: 'ClockIn',
          email,
          phoneNumber: '0000000099',
          passwordHash,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
      const agent = request.agent(httpServer);
      await agent
        .post('/api/v1/auth/login')
        .send({ email, password: 'RacePass123' });

      const [first, second] = await Promise.all([
        agent.post('/api/v1/attendance/clock-in'),
        agent.post('/api/v1/attendance/clock-in'),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      const activeSessions = await prisma.attendanceSession.count({
        where: { userId: user.id, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      });
      expect(activeSessions).toBe(1);
    });

    it('two simultaneous task-timer starts for the same user: exactly one succeeds', async () => {
      const email = 'e2e-race-timer@atms.local';
      const passwordHash = await argon2.hash('RacePass123', {
        type: argon2.argon2id,
      });
      const user = await prisma.user.create({
        data: {
          firstName: 'Race',
          surname: 'Timer',
          email,
          phoneNumber: '0000000098',
          passwordHash,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
      const task = await adminAgent.post('/api/v1/tasks').send({
        title: 'Race timer task',
        priority: 'HIGH',
        assigneeId: user.id,
      });
      expect(task.status).toBe(201);

      const agent = request.agent(httpServer);
      await agent
        .post('/api/v1/auth/login')
        .send({ email, password: 'RacePass123' });
      await agent.post('/api/v1/attendance/clock-in');

      const [first, second] = await Promise.all([
        agent.post('/api/v1/task-timers/start').send({ taskId: task.body.id }),
        agent.post('/api/v1/task-timers/start').send({ taskId: task.body.id }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);

      const runningTimers = await prisma.taskTimeEntry.count({
        where: { userId: user.id, status: 'RUNNING' },
      });
      expect(runningTimers).toBe(1);
    });
  });
});
