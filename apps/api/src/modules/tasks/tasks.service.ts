import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CreateTaskInput,
  TaskStatus,
  TaskTimeEntryStatus,
  UpdateTaskInput,
  UserRole,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // AC-005-002-01: an org setting controls whether employees may create tasks at all;
  // AC-005-002-02: an employee-created task defaults to that employee.
  async create(actorId: string, actorRole: string, input: CreateTaskInput) {
    if (actorRole === UserRole.EMPLOYEE) {
      const settings = await this.prisma.appSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default' },
        update: {},
      });
      if (!settings.employeesCanCreateTasks) {
        throw new ForbiddenException(
          'Employees are not permitted to create tasks',
        );
      }
    }

    const assigneeId =
      actorRole === UserRole.EMPLOYEE
        ? actorId
        : (input.assigneeId ?? undefined);

    const task = await this.prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        estimatedMinutes: input.estimatedMinutes,
        assigneeId,
        createdById: actorId,
      },
    });

    await this.audit.record({
      actorId,
      action: AuditAction.TASK_CREATED,
      targetType: 'Task',
      targetId: task.id,
      after: { title: task.title, assigneeId: task.assigneeId },
    });
    return task;
  }

  async findById(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, firstName: true, surname: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // AC-005-008-01/02: employee list defaults to their own active tasks, filterable.
  async listForUser(userId: string, status?: string, priority?: string) {
    return this.prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: status
          ? (status as TaskStatus)
          : { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        priority: priority as never,
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });
  }

  async listAll(filters: {
    status?: string;
    priority?: string;
    assigneeId?: string;
  }) {
    return this.prisma.task.findMany({
      where: {
        status: filters.status as never,
        priority: filters.priority as never,
        assigneeId: filters.assigneeId,
      },
      include: {
        assignee: { select: { id: true, firstName: true, surname: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Employees may only change status on their own tasks; every other field is admin-only
  // (AC-005-004-04 priority audited, AC-005-003-03 reassignment doesn't rewrite history).
  async update(
    actorId: string,
    actorRole: string,
    taskId: string,
    input: UpdateTaskInput,
  ) {
    const before = await this.findById(taskId);

    if (actorRole === UserRole.EMPLOYEE) {
      if (before.assigneeId !== actorId) {
        throw new ForbiddenException('You can only update your own tasks');
      }
      const allowedKeys = new Set(['status']);
      const attemptedKeys = Object.keys(input);
      if (attemptedKeys.some((k) => !allowedKeys.has(k))) {
        throw new ForbiddenException('Employees may only update task status');
      }
    }

    if (input.status === TaskStatus.COMPLETED) {
      const runningEntry = await this.prisma.taskTimeEntry.findFirst({
        where: { taskId, status: TaskTimeEntryStatus.RUNNING },
      });
      if (runningEntry) {
        throw new BadRequestException(
          'Stop the active timer on this task before completing it',
        );
      }
    }

    if (
      (before.status === TaskStatus.COMPLETED ||
        before.status === TaskStatus.CANCELLED) &&
      input.status &&
      input.status !== before.status &&
      actorRole !== UserRole.ADMINISTRATOR
    ) {
      throw new ForbiddenException(
        'Only an administrator can reopen a completed or cancelled task',
      );
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        estimatedMinutes: input.estimatedMinutes,
        assigneeId: input.assigneeId,
        status: input.status as TaskStatus | undefined,
        completedAt:
          input.status === TaskStatus.COMPLETED ? new Date() : undefined,
      },
    });

    if (input.status && input.status !== before.status) {
      await this.audit.record({
        actorId,
        action: AuditAction.TASK_STATUS_CHANGED,
        targetType: 'Task',
        targetId: taskId,
        before: { status: before.status },
        after: { status: input.status },
      });
    }
    if (input.assigneeId && input.assigneeId !== before.assigneeId) {
      await this.audit.record({
        actorId,
        action: AuditAction.TASK_ASSIGNED,
        targetType: 'Task',
        targetId: taskId,
        before: { assigneeId: before.assigneeId },
        after: { assigneeId: input.assigneeId },
      });
    }
    await this.audit.record({
      actorId,
      action: AuditAction.TASK_UPDATED,
      targetType: 'Task',
      targetId: taskId,
      after: input,
    });

    return task;
  }

  // AC-005-005-03/04 + AC-006-010-*: actual time and variance derived from time entries, never stored.
  async getActualMinutes(taskId: string) {
    const entries = await this.prisma.taskTimeEntry.findMany({
      where: { taskId },
    });
    const totalMs = entries.reduce((sum, e) => {
      const end = e.endAt ?? new Date();
      return sum + Math.max(0, end.getTime() - e.startAt.getTime());
    }, 0);
    return Math.round(totalMs / 60000);
  }
}
