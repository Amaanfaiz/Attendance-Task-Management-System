import { Injectable } from '@nestjs/common';
import { getUtcDayRange, reconcile, type Interval } from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type TimelineEventType = 'ATTENDANCE' | 'BREAK' | 'TASK';

export interface TimelineEvent {
  type: TimelineEventType;
  label: string;
  start: Date;
  end: Date | null;
}

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  // AC-007-001-*, AC-007-002-*, AC-007-003-*: the single source of truth for a day's
  // attendance vs task-time reconciliation, reused by the My Day dashboard and reports.
  async getDailySummary(userId: string, date: string) {
    const { start, end } = getUtcDayRange(date);

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { userId, clockInAt: { gte: start, lt: end } },
      include: {
        breaks: true,
        taskTimeEntries: { include: { task: { select: { title: true } } } },
      },
      orderBy: { clockInAt: 'asc' },
    });

    let netWorkingMinutes = 0;
    let taskMinutes = 0;
    let breakMinutes = 0;
    let unallocatedMinutes = 0;
    let hasDataQualityException = false;
    const timeline: TimelineEvent[] = [];

    for (const session of sessions) {
      const attendanceInterval: Interval = {
        start: session.clockInAt,
        end: session.clockOutAt,
      };
      const breakIntervals: Interval[] = session.breaks.map((b) => ({
        start: b.startAt,
        end: b.endAt,
      }));
      const taskIntervals: Interval[] = session.taskTimeEntries.map((t) => ({
        start: t.startAt,
        end: t.endAt,
      }));

      const result = reconcile(
        attendanceInterval,
        breakIntervals,
        taskIntervals,
      );
      netWorkingMinutes += result.netWorkingMinutes;
      taskMinutes += result.taskMinutes;
      breakMinutes += result.breakMinutes;
      unallocatedMinutes += result.unallocatedMinutes;
      hasDataQualityException =
        hasDataQualityException || result.hasDataQualityException;

      timeline.push({
        type: 'ATTENDANCE',
        label: 'Clocked in',
        start: session.clockInAt,
        end: session.clockOutAt,
      });
      for (const b of session.breaks) {
        timeline.push({
          type: 'BREAK',
          label: 'Break',
          start: b.startAt,
          end: b.endAt,
        });
      }
      for (const t of session.taskTimeEntries) {
        timeline.push({
          type: 'TASK',
          label: t.task.title,
          start: t.startAt,
          end: t.endAt,
        });
      }
    }

    timeline.sort((a, b) => a.start.getTime() - b.start.getTime());

    return {
      date,
      netWorkingMinutes: Math.round(netWorkingMinutes),
      taskMinutes: Math.round(taskMinutes),
      breakMinutes: Math.round(breakMinutes),
      unallocatedMinutes: Math.round(unallocatedMinutes),
      hasDataQualityException,
      timeline,
      sessionCount: sessions.length,
    };
  }
}
