import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceSessionStatus,
  TaskStatus,
  TaskTimeEntryStatus,
  getUtcDayRange,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TaskTimerService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireActiveWorkingSession(userId: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { userId, status: AttendanceSessionStatus.ACTIVE },
    });
    if (!session) {
      throw new BadRequestException(
        'You must be clocked in and not on break to use the task timer',
      );
    }
    return session;
  }

  private async requireEligibleTask(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.assigneeId !== userId) {
      throw new BadRequestException('This task is not assigned to you');
    }
    if (
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'This task is completed or cancelled and cannot be timed',
      );
    }
    return task;
  }

  private async requireNoRunningTimer(userId: string) {
    const running = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, status: TaskTimeEntryStatus.RUNNING },
      include: { task: { select: { id: true, title: true } } },
    });
    if (running) {
      throw new ConflictException({
        message: 'A task timer is already running',
        activeTimer: running,
      });
    }
  }

  // AC-006-001-01..04: clocked in & not on break, task eligible, server time, one active timer.
  async start(userId: string, taskId: string) {
    const session = await this.requireActiveWorkingSession(userId);
    const task = await this.requireEligibleTask(taskId, userId);
    await this.requireNoRunningTimer(userId);

    try {
      const [entry] = await this.prisma.$transaction([
        this.prisma.taskTimeEntry.create({
          data: {
            taskId,
            userId,
            attendanceSessionId: session.id,
            startAt: new Date(),
            status: TaskTimeEntryStatus.RUNNING,
          },
        }),
        ...(task.status === TaskStatus.TO_DO
          ? [
              this.prisma.task.update({
                where: { id: taskId },
                data: { status: TaskStatus.IN_PROGRESS },
              }),
            ]
          : []),
      ]);
      return entry;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('A task timer is already running');
      }
      throw err;
    }
  }

  /** Resume is start() for a task the user has worked on before — a fresh segment (AC-006-004-02). */
  async resume(userId: string, taskId: string) {
    const priorEntry = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, taskId },
    });
    if (!priorEntry) {
      throw new BadRequestException(
        'This task has not been started before; use start instead',
      );
    }
    return this.start(userId, taskId);
  }

  // AC-006-003-01..04: only an active timer can be paused; closes the current segment.
  async pause(userId: string) {
    const running = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, status: TaskTimeEntryStatus.RUNNING },
    });
    if (!running) {
      throw new BadRequestException('No active task timer to pause');
    }
    return this.prisma.taskTimeEntry.update({
      where: { id: running.id },
      data: { endAt: new Date(), status: TaskTimeEntryStatus.CLOSED },
    });
  }

  // AC-006-005-01..04: only an active timer can be stopped; server time finalises it.
  async stop(userId: string) {
    const running = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, status: TaskTimeEntryStatus.RUNNING },
    });
    if (!running) {
      throw new BadRequestException('No active task timer to stop');
    }
    return this.prisma.taskTimeEntry.update({
      where: { id: running.id },
      data: { endAt: new Date(), status: TaskTimeEntryStatus.CLOSED },
    });
  }

  // AC-006-006-01..04: stop current + start selected task at one consistent server boundary.
  async switchTask(userId: string, newTaskId: string) {
    const session = await this.requireActiveWorkingSession(userId);
    const running = await this.prisma.taskTimeEntry.findFirst({
      where: { userId, status: TaskTimeEntryStatus.RUNNING },
    });
    if (!running) {
      throw new BadRequestException('No active task timer to switch from');
    }
    if (running.taskId === newTaskId) {
      throw new BadRequestException('That task is already active');
    }
    const newTask = await this.requireEligibleTask(newTaskId, userId);

    const now = new Date();
    const [, newEntry] = await this.prisma.$transaction([
      this.prisma.taskTimeEntry.update({
        where: { id: running.id },
        data: { endAt: now, status: TaskTimeEntryStatus.CLOSED },
      }),
      this.prisma.taskTimeEntry.create({
        data: {
          taskId: newTaskId,
          userId,
          attendanceSessionId: session.id,
          startAt: now,
          status: TaskTimeEntryStatus.RUNNING,
        },
      }),
      ...(newTask.status === TaskStatus.TO_DO
        ? [
            this.prisma.task.update({
              where: { id: newTaskId },
              data: { status: TaskStatus.IN_PROGRESS },
            }),
          ]
        : []),
    ]);
    return newEntry;
  }

  // AC-006-009-01..04: daily interval log, chronological, excluding paused (closed-out) gaps.
  async getDailyLog(userId: string, date: string) {
    const { start, end } = getUtcDayRange(date);

    return this.prisma.taskTimeEntry.findMany({
      where: { userId, startAt: { gte: start, lt: end } },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { startAt: 'asc' },
    });
  }
}
