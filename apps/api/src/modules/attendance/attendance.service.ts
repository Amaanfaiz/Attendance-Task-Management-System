import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceSessionStatus,
  BreakRecordStatus,
  TaskTimeEntryStatus,
  UserStatus,
  getUtcDayRange,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async findActiveSession(userId: string) {
    return this.prisma.attendanceSession.findFirst({
      where: {
        userId,
        status: {
          in: [
            AttendanceSessionStatus.ACTIVE,
            AttendanceSessionStatus.ON_BREAK,
          ],
        },
      },
    });
  }

  // AC-003-003-01/02: current state is derived from server records on every call.
  async getCurrentState(userId: string) {
    const session = await this.findActiveSession(userId);
    if (!session) {
      return { state: 'CLOCKED_OUT' as const, session: null };
    }
    const activeBreak = await this.prisma.breakRecord.findFirst({
      where: {
        attendanceSessionId: session.id,
        status: BreakRecordStatus.ACTIVE,
      },
    });
    const activeTimer = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, status: TaskTimeEntryStatus.RUNNING },
      include: { task: { select: { id: true, title: true } } },
    });
    return {
      state:
        session.status === AttendanceSessionStatus.ON_BREAK
          ? ('ON_BREAK' as const)
          : ('WORKING' as const),
      session,
      activeBreak,
      activeTimer,
    };
  }

  // AC-003-001-01/02/03: only an ACTIVE user may clock in, server time is authoritative,
  // and BR-002 (one active session) is additionally enforced by a DB partial unique index.
  async clockIn(userId: string) {
    const existing = await this.findActiveSession(userId);
    if (existing) {
      throw new ConflictException({
        message: 'Already clocked in',
        existingClockInAt: existing.clockInAt,
      });
    }
    try {
      return await this.prisma.attendanceSession.create({
        data: {
          userId,
          clockInAt: new Date(),
          status: AttendanceSessionStatus.ACTIVE,
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Already clocked in');
      }
      throw err;
    }
  }

  /**
   * BR-007: clocking out requires any active task timer and active break to be resolved
   * first. Without confirm=true this returns the blocking state (AC-003-005-02,
   * AC-003-006-02) instead of clocking out, so the frontend can prompt the user.
   */
  async clockOut(userId: string, confirm: boolean) {
    const session = await this.findActiveSession(userId);
    if (!session) {
      throw new BadRequestException('No active attendance session');
    }

    const activeBreak = await this.prisma.breakRecord.findFirst({
      where: {
        attendanceSessionId: session.id,
        status: BreakRecordStatus.ACTIVE,
      },
    });
    const activeTimer = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, status: TaskTimeEntryStatus.RUNNING },
      include: { task: { select: { id: true, title: true } } },
    });

    if ((activeBreak || activeTimer) && !confirm) {
      return {
        requiresConfirmation: true,
        activeBreak: activeBreak ?? null,
        activeTimer: activeTimer ?? null,
      };
    }

    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: any[] = [];
    if (activeTimer) {
      operations.push(
        this.prisma.taskTimeEntry.update({
          where: { id: activeTimer.id },
          data: { endAt: now, status: TaskTimeEntryStatus.CLOSED },
        }),
      );
    }
    if (activeBreak) {
      operations.push(
        this.prisma.breakRecord.update({
          where: { id: activeBreak.id },
          data: { endAt: now, status: BreakRecordStatus.COMPLETED },
        }),
      );
    }
    operations.push(
      this.prisma.attendanceSession.update({
        where: { id: session.id },
        data: { clockOutAt: now, status: AttendanceSessionStatus.COMPLETED },
      }),
    );

    const results = await this.prisma.$transaction(operations);
    const updatedSession = results[results.length - 1];

    return { requiresConfirmation: false, session: updatedSession };
  }

  // AC-003-007-01/02/03: own history, chronological, filterable by date range.
  //
  // `to` must mean "through the end of that day", not "at exactly its first
  // instant" - new Date('2026-09-08') parses as 2026-09-08T00:00:00.000Z, so a
  // naive `lte: new Date(to)` excluded almost every record on the `to` date
  // itself (everything but a clock-in at exactly UTC midnight). Found live:
  // filtering from=today&to=today returned 0 records despite a same-day
  // session existing. Use getUtcDayRange's end-of-day boundary instead.
  async getMyHistory(userId: string, from?: string, to?: string) {
    return this.prisma.attendanceSession.findMany({
      where: {
        userId,
        clockInAt: {
          gte: from ? getUtcDayRange(from).start : undefined,
          lte: to ? new Date(getUtcDayRange(to).end.getTime() - 1) : undefined,
        },
      },
      include: { breaks: true },
      orderBy: { clockInAt: 'desc' },
    });
  }

  async getSessionDetail(userId: string, sessionId: string, isAdmin: boolean) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        breaks: true,
        taskTimeEntries: {
          include: { task: { select: { id: true, title: true } } },
        },
      },
    });
    if (!session) throw new NotFoundException('Attendance session not found');
    if (!isAdmin && session.userId !== userId) {
      throw new BadRequestException('Not your attendance record');
    }
    return session;
  }

  // US-003-008: admin live list of who is currently clocked in / on break.
  // AC-008-003-03: a user deactivated/suspended after clocking in still has an
  // open session (deactivation doesn't retroactively close it) - found live,
  // this was leaking a stale "Working" row for an INACTIVE test account.
  async getLive() {
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        status: {
          in: [
            AttendanceSessionStatus.ACTIVE,
            AttendanceSessionStatus.ON_BREAK,
          ],
        },
        user: { status: UserStatus.ACTIVE },
      },
      include: {
        // AC-008-003-04: department name (not just id) needed so the live table can
        // actually filter/display by department, not just carry an opaque FK.
        user: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            email: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { clockInAt: 'asc' },
    });

    const userIds = sessions.map((s) => s.userId);
    const activeTimers = await this.prisma.taskTimeEntry.findMany({
      where: { userId: { in: userIds }, status: TaskTimeEntryStatus.RUNNING },
      include: { task: { select: { id: true, title: true } } },
    });
    const timerByUser = new Map(activeTimers.map((t) => [t.userId, t]));

    return sessions.map((s) => ({
      ...s,
      currentTask: timerByUser.get(s.userId) ?? null,
    }));
  }
}
