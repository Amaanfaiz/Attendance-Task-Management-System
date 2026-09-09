import { ForbiddenException, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AttendanceSessionStatus,
  AuditAction,
  NotificationType,
  TaskTimeEntryStatus,
  getUtcDayRange,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { EmailService } from '../../common/services/email.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reconciliation: ReconciliationService,
    private readonly email: EmailService,
  ) {}

  private async getSettings() {
    return this.prisma.appSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  // Email is a secondary channel gated by settings (AC-011-001-01), unlike password
  // reset which always sends when configured - so this checks the setting first and
  // only then defers to EmailService (which itself never throws).
  private async maybeSendEmail(to: string, subject: string, text: string) {
    const settings = await this.getSettings();
    if (!settings.notificationsEmailEnabled) return;
    await this.email.send(to, subject, text);
  }

  // AC-011-001-01/02/04: fires only on a real reassignment to someone else - an
  // employee creating and auto-assigning their own task shouldn't notify themselves.
  // Dedupe: skip if this exact assignee+task already has an unread notification.
  async notifyTaskAssigned(
    actorId: string,
    assigneeId: string,
    taskId: string,
    taskTitle: string,
  ) {
    if (actorId === assigneeId) return;

    const dedupeKey = `task:${taskId}:assignee:${assigneeId}`;
    const existing = await this.prisma.notification.findFirst({
      where: { dedupeKey, readAt: null },
    });
    if (existing) return;

    const [assignee, assigner] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: assigneeId } }),
      this.prisma.user.findUnique({ where: { id: actorId } }),
    ]);
    if (!assignee) return;
    const assignerName = assigner
      ? `${assigner.firstName} ${assigner.surname}`
      : 'An administrator';

    await this.prisma.notification.create({
      data: {
        userId: assigneeId,
        type: NotificationType.TASK_ASSIGNED,
        title: `New task assigned: ${taskTitle}`,
        body: `${assignerName} assigned you this task.`,
        taskId,
        dedupeKey,
      },
    });

    await this.maybeSendEmail(
      assignee.email,
      `New task assigned: ${taskTitle}`,
      `${assignerName} assigned you "${taskTitle}". Sign in to view it.`,
    );
  }

  async listForUser(userId: string) {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unreadCount, items };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    if (notification.readAt) return notification;
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  // AC-011-002: missing clock-out reminder. "Active" covers both ACTIVE and ON_BREAK -
  // the two non-terminal AttendanceSessionStatus values, same pairing attendance.service.ts's
  // findActiveSession()/getLive() already use for "currently clocked in." One notification
  // per session, ever - it naturally stops recurring once they clock out (AC-011-002-03: this
  // never clocks them out itself, it only informs).
  async scanMissingClockOuts() {
    const settings = await this.getSettings();
    const cutoff = new Date(
      Date.now() - settings.missingClockOutThresholdMinutes * 60_000,
    );
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        status: {
          in: [
            AttendanceSessionStatus.ACTIVE,
            AttendanceSessionStatus.ON_BREAK,
          ],
        },
        clockInAt: { lte: cutoff },
      },
      include: { user: { select: { id: true, email: true } } },
    });

    for (const session of sessions) {
      const dedupeKey = `session:${session.id}`;
      const existing = await this.prisma.notification.findFirst({
        where: { dedupeKey },
      });
      if (existing) continue;

      const hours = (settings.missingClockOutThresholdMinutes / 60).toFixed(1);
      await this.prisma.notification.create({
        data: {
          userId: session.userId,
          type: NotificationType.MISSING_CLOCK_OUT,
          title: 'You may have forgotten to clock out',
          body: `You've been clocked in for over ${hours} hours. If you're done for the day, remember to clock out.`,
          dedupeKey,
        },
      });
      await this.audit.record({
        actorId: null,
        action: AuditAction.REMINDER_SENT,
        targetType: 'AttendanceSession',
        targetId: session.id,
        metadata: {
          type: NotificationType.MISSING_CLOCK_OUT,
          userId: session.userId,
        },
      });
      await this.maybeSendEmail(
        session.user.email,
        'You may have forgotten to clock out',
        `You've been clocked in for over ${hours} hours. If you're done for the day, remember to clock out.`,
      );
    }
  }

  // AC-011-003: long-running task-timer reminder. Repeats on a configurable cooldown
  // rather than firing once - re-created only if the last one for this entry is older
  // than the cooldown (AC-011-003-04). Never touches the timer itself (AC-011-003-02).
  async scanLongRunningTimers() {
    const settings = await this.getSettings();
    const cutoff = new Date(
      Date.now() - settings.longRunningTimerThresholdMinutes * 60_000,
    );
    const entries = await this.prisma.taskTimeEntry.findMany({
      where: { status: TaskTimeEntryStatus.RUNNING, startAt: { lte: cutoff } },
      include: {
        task: { select: { id: true, title: true } },
        user: { select: { id: true, email: true } },
      },
    });

    for (const entry of entries) {
      const dedupeKey = `timer:${entry.id}`;
      const lastSent = await this.prisma.notification.findFirst({
        where: { dedupeKey },
        orderBy: { createdAt: 'desc' },
      });
      const cooldownCutoff = new Date(
        Date.now() - settings.longRunningTimerCooldownMinutes * 60_000,
      );
      if (lastSent && lastSent.createdAt > cooldownCutoff) continue;

      const hours = (settings.longRunningTimerThresholdMinutes / 60).toFixed(1);
      await this.prisma.notification.create({
        data: {
          userId: entry.userId,
          type: NotificationType.LONG_RUNNING_TIMER,
          title: `Timer running long on "${entry.task.title}"`,
          body: `This task's timer has been running for over ${hours} hours. Check it's still accurate.`,
          taskId: entry.taskId,
          dedupeKey,
        },
      });
      await this.audit.record({
        actorId: null,
        action: AuditAction.REMINDER_SENT,
        targetType: 'TaskTimeEntry',
        targetId: entry.id,
        metadata: {
          type: NotificationType.LONG_RUNNING_TIMER,
          userId: entry.userId,
        },
      });
      await this.maybeSendEmail(
        entry.user.email,
        `Timer running long on "${entry.task.title}"`,
        `This task's timer has been running for over ${hours} hours. Check it's still accurate.`,
      );
    }
  }

  // AC-011-004: unallocated-time reminder. Only considers yesterday (UTC), and only
  // once the configured cutoff hour has passed today - gives room for same-morning
  // corrections before nagging about a day that's already over. Reuses
  // ReconciliationService.getDailySummary() rather than recomputing the math - it's
  // already the single source of truth for unallocated minutes (AC-011-004-04: never
  // invents a number, it's the same figure My Day and reports show).
  async scanUnallocatedTime() {
    const settings = await this.getSettings();
    const nowUtcHour = new Date().getUTCHours();
    if (nowUtcHour < settings.unallocatedReminderCutoffHourUtc) return;

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    const { start, end } = getUtcDayRange(dateStr);

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { clockInAt: { gte: start, lt: end } },
      select: { userId: true, clockOutAt: true },
    });
    const userIds = [...new Set(sessions.map((s) => s.userId))];
    // Only a day where every session for that user has actually ended counts as
    // "completed" (AC-011-004-01) - a still-open session from yesterday isn't done yet.
    const completedUserIds = userIds.filter((userId) =>
      sessions
        .filter((s) => s.userId === userId)
        .every((s) => s.clockOutAt !== null),
    );

    for (const userId of completedUserIds) {
      const dedupeKey = `unallocated:${userId}:${dateStr}`;
      const existing = await this.prisma.notification.findFirst({
        where: { dedupeKey },
      });
      if (existing) continue;

      const summary = await this.reconciliation.getDailySummary(
        userId,
        dateStr,
      );
      if (
        summary.unallocatedMinutes < settings.unallocatedTimeThresholdMinutes
      ) {
        continue;
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) continue;

      const hours = (summary.unallocatedMinutes / 60).toFixed(1);
      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.UNALLOCATED_TIME,
          title: `${hours}h unallocated on ${dateStr}`,
          body: `${dateStr} has ${hours} hours of clocked-in time not tracked against any task. Review your daily timeline if that doesn't look right.`,
          dedupeKey,
        },
      });
      await this.audit.record({
        actorId: null,
        action: AuditAction.REMINDER_SENT,
        targetType: 'User',
        targetId: userId,
        metadata: {
          type: NotificationType.UNALLOCATED_TIME,
          date: dateStr,
          unallocatedMinutes: summary.unallocatedMinutes,
        },
      });
      await this.maybeSendEmail(
        user.email,
        `${hours}h unallocated on ${dateStr}`,
        `${dateStr} has ${hours} hours of clocked-in time not tracked against any task. Review your daily timeline if that doesn't look right.`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runReminderScans() {
    await this.scanMissingClockOuts();
    await this.scanLongRunningTimers();
    await this.scanUnallocatedTime();
  }
}
