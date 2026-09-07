import { Injectable } from '@nestjs/common';
import { calculateNetWorkingMinutes, reconcile, type Interval } from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReportFilters {
  from: Date;
  to: Date;
  userId?: string;
  departmentId?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // AC-010-001-01..04: clock-in/out, break total, net work; incomplete records flagged.
  async attendanceReport(filters: ReportFilters) {
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        clockInAt: { gte: filters.from, lte: filters.to },
        userId: filters.userId,
        user: filters.departmentId ? { departmentId: filters.departmentId } : undefined,
      },
      include: { user: { select: { firstName: true, surname: true, email: true } }, breaks: true },
      orderBy: { clockInAt: 'asc' },
    });

    return sessions.map((s) => {
      const attendanceInterval: Interval = { start: s.clockInAt, end: s.clockOutAt };
      const breakIntervals: Interval[] = s.breaks.map((b) => ({ start: b.startAt, end: b.endAt }));
      const netWorkingMinutes = calculateNetWorkingMinutes(attendanceInterval, breakIntervals);
      const breakMinutes = breakIntervals.reduce((sum, b) => {
        const end = b.end ?? new Date();
        return sum + Math.max(0, (end.getTime() - b.start.getTime()) / 60000);
      }, 0);
      const incomplete = !s.clockOutAt || s.breaks.some((b) => !b.endAt);
      return {
        date: s.clockInAt.toISOString().slice(0, 10),
        employee: `${s.user.firstName} ${s.user.surname}`,
        email: s.user.email,
        clockIn: s.clockInAt.toISOString(),
        clockOut: s.clockOutAt?.toISOString() ?? '',
        breakMinutes: Math.round(breakMinutes),
        netWorkingMinutes: Math.round(netWorkingMinutes),
        incomplete,
      };
    });
  }

  // AC-010-003-01..04: group by user/task/date, actual duration, status, estimate vs actual.
  async taskTimeReport(filters: ReportFilters & { taskId?: string }) {
    const entries = await this.prisma.taskTimeEntry.findMany({
      where: {
        startAt: { gte: filters.from, lte: filters.to },
        userId: filters.userId,
        taskId: filters.taskId,
        user: filters.departmentId ? { departmentId: filters.departmentId } : undefined,
      },
      include: {
        user: { select: { firstName: true, surname: true } },
        task: { select: { title: true, status: true, estimatedMinutes: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    return entries.map((e) => {
      const end = e.endAt ?? new Date();
      const durationMinutes = Math.max(0, Math.round((end.getTime() - e.startAt.getTime()) / 60000));
      return {
        date: e.startAt.toISOString().slice(0, 10),
        employee: `${e.user.firstName} ${e.user.surname}`,
        task: e.task.title,
        taskStatus: e.task.status,
        start: e.startAt.toISOString(),
        end: e.endAt?.toISOString() ?? '',
        durationMinutes,
        estimatedMinutes: e.task.estimatedMinutes ?? null,
      };
    });
  }

  // AC-010-004-01..04: net work, task time, unallocated time per user/day; exceptions flagged.
  async unallocatedReport(filters: ReportFilters) {
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        clockInAt: { gte: filters.from, lte: filters.to },
        userId: filters.userId,
        user: filters.departmentId ? { departmentId: filters.departmentId } : undefined,
      },
      include: {
        user: { select: { firstName: true, surname: true } },
        breaks: true,
        taskTimeEntries: true,
      },
      orderBy: { clockInAt: 'asc' },
    });

    return sessions.map((s) => {
      const result = reconcile(
        { start: s.clockInAt, end: s.clockOutAt },
        s.breaks.map((b) => ({ start: b.startAt, end: b.endAt })),
        s.taskTimeEntries.map((t) => ({ start: t.startAt, end: t.endAt })),
      );
      return {
        date: s.clockInAt.toISOString().slice(0, 10),
        employee: `${s.user.firstName} ${s.user.surname}`,
        netWorkingMinutes: Math.round(result.netWorkingMinutes),
        taskMinutes: Math.round(result.taskMinutes),
        unallocatedMinutes: Math.round(result.unallocatedMinutes),
        dataQualityException: result.hasDataQualityException,
      };
    });
  }

  // AC-004-006-01..04: individual break periods and daily totals, active vs completed.
  async breaksReport(filters: ReportFilters) {
    const breaks = await this.prisma.breakRecord.findMany({
      where: {
        startAt: { gte: filters.from, lte: filters.to },
        attendanceSession: {
          userId: filters.userId,
          user: filters.departmentId ? { departmentId: filters.departmentId } : undefined,
        },
      },
      include: { attendanceSession: { include: { user: { select: { firstName: true, surname: true } } } } },
      orderBy: { startAt: 'asc' },
    });

    return breaks.map((b) => {
      const end = b.endAt ?? new Date();
      const durationMinutes = Math.max(0, Math.round((end.getTime() - b.startAt.getTime()) / 60000));
      return {
        date: b.startAt.toISOString().slice(0, 10),
        employee: `${b.attendanceSession.user.firstName} ${b.attendanceSession.user.surname}`,
        start: b.startAt.toISOString(),
        end: b.endAt?.toISOString() ?? '',
        durationMinutes,
        status: b.status,
      };
    });
  }
}
