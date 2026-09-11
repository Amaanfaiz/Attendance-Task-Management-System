import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// RISK-015: the SRS's Auditor/Management Viewer persona (§3) can "read
// authorised attendance/task/audit reports without editing operational
// records." Enforced by AuditorScopeGuard, which default-denies AUDITOR on
// every route except those explicitly marked @AuditorAllowed() - this proves
// both halves of that: the read surfaces genuinely work, and everything else
// genuinely doesn't, not just that the guard exists.
describe('Auditor role (RISK-015) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let httpServer: import('http').Server;

  const auditorEmail = 'e2e-auditor@atms.local';
  const auditorPassword = 'AuditorPass123';
  let auditorAgent: ReturnType<typeof request.agent>;

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
    await prisma.$executeRawUnsafe(
      `DELETE FROM "users" WHERE email = '${auditorEmail}'`,
    );

    const passwordHash = await argon2.hash(auditorPassword, {
      type: argon2.argon2id,
    });
    await prisma.user.create({
      data: {
        firstName: 'E2E',
        surname: 'Auditor',
        email: auditorEmail,
        phoneNumber: '0000000099',
        passwordHash,
        role: 'AUDITOR',
        status: 'ACTIVE',
      },
    });

    auditorAgent = request.agent(httpServer);
    const login = await auditorAgent
      .post('/api/v1/auth/login')
      .send({ email: auditorEmail, password: auditorPassword });
    expect(login.status).toBe(200);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: auditorEmail } });
    await app.close();
  });

  describe('Allowed: the read-only surfaces the SRS names for this persona', () => {
    it('can view the attendance report', async () => {
      const res = await auditorAgent
        .get('/api/v1/reports/attendance')
        .query({ from: '2020-01-01', to: '2020-01-02' });
      expect(res.status).toBe(200);
    });

    it('can view the audit log', async () => {
      const res = await auditorAgent.get('/api/v1/audit');
      expect(res.status).toBe(200);
    });

    it('can view live organisation-wide attendance', async () => {
      const res = await auditorAgent.get('/api/v1/attendance/admin/live');
      expect(res.status).toBe(200);
    });

    it('can list users (for the reports employee filter)', async () => {
      const res = await auditorAgent.get('/api/v1/users');
      expect(res.status).toBe(200);
    });

    it('can view and update its own profile', async () => {
      const getRes = await auditorAgent.get('/api/v1/users/me');
      expect(getRes.status).toBe(200);
      const patchRes = await auditorAgent
        .patch('/api/v1/users/me')
        .send({ phoneNumber: '0000000098' });
      expect(patchRes.status).toBe(200);
    });
  });

  describe('Blocked: everything that edits an operational record', () => {
    it('cannot clock in', async () => {
      const res = await auditorAgent.post('/api/v1/attendance/clock-in');
      expect(res.status).toBe(403);
    });

    it('cannot start a break', async () => {
      const res = await auditorAgent.post('/api/v1/breaks/start');
      expect(res.status).toBe(403);
    });

    it('cannot create a task', async () => {
      const res = await auditorAgent
        .post('/api/v1/tasks')
        .send({ title: 'Should be blocked' });
      expect(res.status).toBe(403);
    });

    it('cannot start a task timer', async () => {
      const res = await auditorAgent
        .post('/api/v1/task-timers/start')
        .send({ taskId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(403);
    });

    it('cannot request a correction', async () => {
      const res = await auditorAgent.post('/api/v1/corrections').send({
        targetType: 'ATTENDANCE_SESSION',
        targetId: '00000000-0000-0000-0000-000000000000',
        reason: 'Should be blocked regardless of validity',
      });
      expect(res.status).toBe(403);
    });

    it('cannot approve a correction', async () => {
      const res = await auditorAgent
        .post('/api/v1/corrections/00000000-0000-0000-0000-000000000000/decide')
        .send({ approve: true });
      expect(res.status).toBe(403);
    });

    it('cannot view a single user record by id', async () => {
      const res = await auditorAgent.get(
        '/api/v1/users/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(403);
    });

    it('cannot edit a user', async () => {
      const res = await auditorAgent
        .patch('/api/v1/users/00000000-0000-0000-0000-000000000000')
        .send({ status: 'SUSPENDED' });
      expect(res.status).toBe(403);
    });

    it('cannot change application settings', async () => {
      const res = await auditorAgent
        .patch('/api/v1/settings')
        .send({ notificationsEmailEnabled: true });
      expect(res.status).toBe(403);
    });
  });
});
