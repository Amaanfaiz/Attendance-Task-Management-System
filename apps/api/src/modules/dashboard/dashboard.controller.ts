import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AttendanceSessionStatus,
  TaskStatus,
  TaskTimeEntryStatus,
  UserRole,
  UserStatus,
  getUtcDayRange,
  reconcile,
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
    const todayStart = getUtcDayRange(
      new Date().toISOString().slice(0, 10),
    ).start;

    const [
      totalActiveUsers,
      working,
      onBreak,
      runningTimers,
      tasksByStatusRaw,
      overdueCount,
      missedClockOutCount,
      openSessions,
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
      // AC-008-002 (Attention Required): a session still open from a prior day
      // means the employee never clocked out - surfaced separately from overdue
      // tasks since it's an attendance data-quality issue, not a task one.
      this.prisma.attendanceSession.count({
        where: {
          status: {
            in: [
              AttendanceSessionStatus.ACTIVE,
              AttendanceSessionStatus.ON_BREAK,
            ],
          },
          clockInAt: { lt: todayStart },
        },
      }),
      this.prisma.attendanceSession.findMany({
        where: {
          status: {
            in: [
              AttendanceSessionStatus.ACTIVE,
              AttendanceSessionStatus.ON_BREAK,
            ],
          },
        },
        include: { breaks: true, taskTimeEntries: true },
      }),
    ]);

    const notClockedIn = Math.max(0, totalActiveUsers - working - onBreak);
    const tasksByStatus = Object.fromEntries(
      tasksByStatusRaw.map((r) => [r.status, r._count._all]),
    );

    // BR-010/AC-007-003-02/AC-010-004-03: unallocated time itself is not a
    // performance signal, but the SRS does define a genuine exception here -
    // reconcile() already flags impossible reconciliation (e.g. task time
    // exceeding attendance time), the same "Data Quality Exceptions" category
    // the Reports module reports on. Surfacing that flag, not an invented
    // minutes-based magnitude threshold, is what's actually specified.
    const dataQualityExceptionCount = openSessions.filter((s) => {
      const result = reconcile(
        { start: s.clockInAt, end: s.clockOutAt },
        s.breaks.map((b) => ({ start: b.startAt, end: b.endAt })),
        s.taskTimeEntries.map((t) => ({ start: t.startAt, end: t.endAt })),
      );
      return result.hasDataQualityException;
    }).length;

    return {
      totalActiveUsers,
      working,
      onBreak,
      notClockedIn,
      runningTaskTimers: runningTimers,
      tasksByStatus,
      overdueTaskCount: overdueCount,
      missedClockOutCount,
      dataQualityExceptionCount,
    };
  }
}
