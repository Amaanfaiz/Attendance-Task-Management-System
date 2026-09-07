import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AttendanceSessionStatus,
  BreakRecordStatus,
  TaskTimeEntryStatus,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BreaksService {
  constructor(private readonly prisma: PrismaService) {}

  // AC-004-001-01/02/03/04 + BR-005: starting a break requires an active (not already
  // on-break) session, and pauses any running task timer at the same server timestamp.
  async startBreak(userId: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { userId, status: AttendanceSessionStatus.ACTIVE },
    });
    if (!session) {
      throw new BadRequestException(
        'You must be clocked in (and not already on break) to start a break',
      );
    }

    const now = new Date();
    const activeTimer = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, status: TaskTimeEntryStatus.RUNNING },
      include: { task: { select: { id: true, title: true } } },
    });

    try {
      const [breakRecord] = await this.prisma.$transaction([
        this.prisma.breakRecord.create({
          data: {
            attendanceSessionId: session.id,
            startAt: now,
            status: BreakRecordStatus.ACTIVE,
          },
        }),
        this.prisma.attendanceSession.update({
          where: { id: session.id },
          data: { status: AttendanceSessionStatus.ON_BREAK },
        }),
        ...(activeTimer
          ? [
              this.prisma.taskTimeEntry.update({
                where: { id: activeTimer.id },
                data: { endAt: now, status: TaskTimeEntryStatus.CLOSED },
              }),
            ]
          : []),
      ]);
      return { breakRecord, pausedTask: activeTimer?.task ?? null };
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('You already have an active break');
      }
      throw err;
    }
  }

  // BR-006: ending a break returns the user to Working but does NOT auto-resume any task.
  async endBreak(userId: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { userId, status: AttendanceSessionStatus.ON_BREAK },
    });
    if (!session) {
      throw new BadRequestException('You do not have an active break');
    }
    const activeBreak = await this.prisma.breakRecord.findFirst({
      where: {
        attendanceSessionId: session.id,
        status: BreakRecordStatus.ACTIVE,
      },
    });
    if (!activeBreak) {
      throw new BadRequestException('You do not have an active break');
    }

    const now = new Date();
    const [breakRecord] = await this.prisma.$transaction([
      this.prisma.breakRecord.update({
        where: { id: activeBreak.id },
        data: { endAt: now, status: BreakRecordStatus.COMPLETED },
      }),
      this.prisma.attendanceSession.update({
        where: { id: session.id },
        data: { status: AttendanceSessionStatus.ACTIVE },
      }),
    ]);
    return breakRecord;
  }

  // AC-004-005-01/02: every break within a day, with incomplete breaks clearly marked.
  async listForSession(sessionId: string) {
    return this.prisma.breakRecord.findMany({
      where: { attendanceSessionId: sessionId },
      orderBy: { startAt: 'asc' },
    });
  }
}
