import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
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
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
