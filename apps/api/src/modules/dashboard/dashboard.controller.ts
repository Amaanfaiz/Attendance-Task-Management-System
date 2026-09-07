import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AttendanceSessionStatus,
  TaskStatus,
  TaskTimeEntryStatus,
  UserRole,
  UserStatus,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

// AC-008-002-01..04: workforce KPIs; AC-008-004-01..04: task status summary with overdue count.
@ApiTags('dashboard')
@Roles(UserRole.ADMINISTRATOR)
@Controller('dashboard/admin')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('kpis')
  async kpis() {
    const [
      totalActiveUsers,
      working,
      onBreak,
      runningTimers,
      tasksByStatusRaw,
      overdueCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.attendanceSession.count({
        where: { status: AttendanceSessionStatus.ACTIVE },
      }),
      this.prisma.attendanceSession.count({
        where: { status: AttendanceSessionStatus.ON_BREAK },
      }),
      this.prisma.taskTimeEntry.count({
        where: { status: TaskTimeEntryStatus.RUNNING },
      }),
      this.prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.task.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
      }),
    ]);

    const notClockedIn = Math.max(0, totalActiveUsers - working - onBreak);
    const tasksByStatus = Object.fromEntries(
      tasksByStatusRaw.map((r) => [r.status, r._count._all]),
    );

    return {
      totalActiveUsers,
      working,
      onBreak,
      notClockedIn,
      runningTaskTimers: runningTimers,
      tasksByStatus,
      overdueTaskCount: overdueCount,
    };
  }
}
