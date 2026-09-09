import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { BreaksModule } from './modules/breaks/breaks.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TaskTimerModule } from './modules/task-timer/task-timer.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { CorrectionsModule } from './modules/corrections/corrections.module';
import { AuditModule } from './modules/audit/audit.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    // In test, config comes entirely from test/setup-env.ts's explicit .env.test load
    // (already in process.env by the time this module initializes). Without
    // ignoreEnvFile here, ConfigModule additionally auto-loads the plain `.env` from
    // cwd regardless of NODE_ENV, and any key present there but *not* in .env.test
    // leaks straight into the test run — e.g. adding COOKIE_SAME_SITE to a local
    // dev .env silently forced Secure cookies onto the e2e suite's plain-HTTP test
    // server, which correctly refuses to send them back, failing every authenticated
    // test after login with 401. Found via that exact failure.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    AttendanceModule,
    BreaksModule,
    TasksModule,
    TaskTimerModule,
    ReconciliationModule,
    CorrectionsModule,
    AuditModule,
    ReportsModule,
    SettingsModule,
    DashboardModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
