import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceSessionStatus,
  AuditAction,
  BreakRecordStatus,
  CorrectionStatus,
  CorrectionTargetType,
  DecideCorrectionInput,
  RequestCorrectionInput,
  TaskTimeEntryStatus,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getTargetOwnerAndInterval(
    targetType: CorrectionTargetType,
    targetId: string,
  ) {
    switch (targetType) {
      case CorrectionTargetType.ATTENDANCE_SESSION: {
        const record = await this.prisma.attendanceSession.findUnique({
          where: { id: targetId },
        });
        if (!record)
          throw new NotFoundException('Attendance session not found');
        return {
          userId: record.userId,
          start: record.clockInAt,
          end: record.clockOutAt,
        };
      }
      case CorrectionTargetType.BREAK_RECORD: {
        const record = await this.prisma.breakRecord.findUnique({
          where: { id: targetId },
          include: { attendanceSession: true },
        });
        if (!record) throw new NotFoundException('Break record not found');
        return {
          userId: record.attendanceSession.userId,
          start: record.startAt,
          end: record.endAt,
        };
      }
      case CorrectionTargetType.TASK_TIME_ENTRY: {
        const record = await this.prisma.taskTimeEntry.findUnique({
          where: { id: targetId },
        });
        if (!record) throw new NotFoundException('Task time entry not found');
        return {
          userId: record.userId,
          start: record.startAt,
          end: record.endAt,
        };
      }
    }
  }

  private async assertNoOverlap(
    targetType: CorrectionTargetType,
    targetId: string,
    userId: string,
    start: Date,
    end: Date,
  ) {
    if (targetType !== CorrectionTargetType.TASK_TIME_ENTRY) return;
    const overlapping = await this.prisma.taskTimeEntry.findFirst({
      where: {
        userId,
        id: { not: targetId },
        startAt: { lt: end },
        OR: [{ endAt: null }, { endAt: { gt: start } }],
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        'Proposed times overlap another recorded task time entry',
      );
    }
  }

  private async applyCorrection(
    targetType: CorrectionTargetType,
    targetId: string,
    proposedStart: Date | undefined,
    proposedEnd: Date | undefined,
  ) {
    // A correction that sets an end/endAt must also transition the record's
    // own status field, or it's left in a stale "still active" state despite
    // genuinely having a real end timestamp - found live: this let a
    // corrected attendance session with a real clockOutAt keep matching the
    // missing-clock-out reminder scan's `status IN (ACTIVE, ON_BREAK)` query,
    // firing a real, incorrect reminder for a session that wasn't actually
    // missing a clock-out. The same staleness would equally affect the
    // long-running-timer scan's `status = RUNNING` query for task time
    // entries, so all three target types are fixed the same way.
    switch (targetType) {
      case CorrectionTargetType.ATTENDANCE_SESSION:
        return this.prisma.attendanceSession.update({
          where: { id: targetId },
          data: {
            clockInAt: proposedStart,
            clockOutAt: proposedEnd,
            ...(proposedEnd
              ? { status: AttendanceSessionStatus.COMPLETED }
              : {}),
          },
        });
      case CorrectionTargetType.BREAK_RECORD:
        return this.prisma.breakRecord.update({
          where: { id: targetId },
          data: {
            startAt: proposedStart,
            endAt: proposedEnd,
            ...(proposedEnd ? { status: BreakRecordStatus.COMPLETED } : {}),
          },
        });
      case CorrectionTargetType.TASK_TIME_ENTRY:
        return this.prisma.taskTimeEntry.update({
          where: { id: targetId },
          data: {
            startAt: proposedStart,
            endAt: proposedEnd,
            ...(proposedEnd ? { status: TaskTimeEntryStatus.CLOSED } : {}),
          },
        });
    }
  }

  // AC-009-001-01..04 / AC-009-003-01..04: original values are untouched until approval.
  async request(userId: string, input: RequestCorrectionInput) {
    const target = await this.getTargetOwnerAndInterval(
      input.targetType as CorrectionTargetType,
      input.targetId,
    );
    if (target.userId !== userId) {
      throw new ForbiddenException(
        'You can only request corrections on your own records',
      );
    }
    const request = await this.prisma.correctionRequest.create({
      data: {
        requestedById: userId,
        targetType: input.targetType as CorrectionTargetType,
        targetId: input.targetId,
        proposedStart: input.proposedStart
          ? new Date(input.proposedStart)
          : undefined,
        proposedEnd: input.proposedEnd
          ? new Date(input.proposedEnd)
          : undefined,
        reason: input.reason,
        status: CorrectionStatus.PENDING,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: AuditAction.CORRECTION_REQUESTED,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: { correctionRequestId: request.id, reason: input.reason },
    });
    return request;
  }

  // AC-009-002-01: the admin must see the record's *current* value next to what's
  // proposed, not just the proposal - found via live AC testing that the pending-list
  // response (and the review page built on it) only ever carried proposedStart/End,
  // with nowhere to see what's actually being changed from.
  async listPending() {
    const requests = await this.prisma.correctionRequest.findMany({
      where: { status: CorrectionStatus.PENDING },
      include: {
        requestedBy: { select: { id: true, firstName: true, surname: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      requests.map(async (r) => {
        const current = await this.getTargetOwnerAndInterval(
          r.targetType as CorrectionTargetType,
          r.targetId,
        ).catch(() => null); // target may have since been deleted/altered - degrade gracefully
        return {
          ...r,
          currentStart: current?.start ?? null,
          currentEnd: current?.end ?? null,
        };
      }),
    );
  }

  async listMine(userId: string) {
    return this.prisma.correctionRequest.findMany({
      where: { requestedById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // AC-009-002-01..04: admin sees original/proposed/reason; approval preserves original
  // via the audit before/after, rejection just records the decision.
  async decide(
    actorId: string,
    correctionId: string,
    input: DecideCorrectionInput,
  ) {
    const request = await this.prisma.correctionRequest.findUnique({
      where: { id: correctionId },
    });
    if (!request) throw new NotFoundException('Correction request not found');
    if (request.status !== CorrectionStatus.PENDING) {
      throw new BadRequestException('This correction has already been decided');
    }

    if (!input.approve) {
      const rejected = await this.prisma.correctionRequest.update({
        where: { id: correctionId },
        data: {
          status: CorrectionStatus.REJECTED,
          decidedById: actorId,
          decidedAt: new Date(),
          decisionComment: input.comment,
        },
      });
      await this.audit.record({
        actorId,
        action: AuditAction.CORRECTION_REJECTED,
        targetType: request.targetType,
        targetId: request.targetId,
        metadata: { correctionRequestId: request.id, comment: input.comment },
      });
      return rejected;
    }

    const before = await this.getTargetOwnerAndInterval(
      request.targetType as CorrectionTargetType,
      request.targetId,
    );
    // AC-009-003-04/AC-009-004-03: a correction that only proposes one of
    // start/end (the common case - "I forgot to stop my timer") was skipping
    // the overlap check entirely, since it only ran when BOTH proposedStart
    // and proposedEnd were set on the request itself. Found live: approving
    // an end-only correction that genuinely overlapped a later real segment
    // went through with no error. Fall back to the record's own unchanged
    // boundary first, matching adminDirectCorrection's already-correct logic.
    const effectiveStart = request.proposedStart ?? before.start;
    const effectiveEnd = request.proposedEnd ?? before.end;
    if (effectiveStart && effectiveEnd) {
      await this.assertNoOverlap(
        request.targetType as CorrectionTargetType,
        request.targetId,
        before.userId,
        effectiveStart,
        effectiveEnd,
      );
    }
    await this.applyCorrection(
      request.targetType as CorrectionTargetType,
      request.targetId,
      request.proposedStart ?? undefined,
      request.proposedEnd ?? undefined,
    );
    // Re-read the actual resulting record rather than echoing the raw proposed values —
    // a correction that only sets `proposedStart` leaves `end` untouched, and the audit
    // trail must reflect what the record actually became, not what fields were submitted.
    const after = await this.getTargetOwnerAndInterval(
      request.targetType as CorrectionTargetType,
      request.targetId,
    );
    const approved = await this.prisma.correctionRequest.update({
      where: { id: correctionId },
      data: {
        status: CorrectionStatus.APPROVED,
        decidedById: actorId,
        decidedAt: new Date(),
        decisionComment: input.comment,
      },
    });
    await this.audit.record({
      actorId,
      action: AuditAction.CORRECTION_APPROVED,
      targetType: request.targetType,
      targetId: request.targetId,
      before: { start: before.start, end: before.end },
      after: { start: after.start, end: after.end },
      metadata: { correctionRequestId: request.id },
    });
    return approved;
  }

  // US-009-004: administrator direct correction — applies immediately, still fully audited.
  async adminDirectCorrection(actorId: string, input: RequestCorrectionInput) {
    const before = await this.getTargetOwnerAndInterval(
      input.targetType as CorrectionTargetType,
      input.targetId,
    );
    const proposedStart = input.proposedStart
      ? new Date(input.proposedStart)
      : before.start;
    const proposedEnd = input.proposedEnd
      ? new Date(input.proposedEnd)
      : (before.end ?? undefined);

    if (proposedStart && proposedEnd) {
      await this.assertNoOverlap(
        input.targetType as CorrectionTargetType,
        input.targetId,
        before.userId,
        proposedStart,
        proposedEnd,
      );
    }

    await this.applyCorrection(
      input.targetType as CorrectionTargetType,
      input.targetId,
      proposedStart,
      proposedEnd,
    );

    const record = await this.prisma.correctionRequest.create({
      data: {
        requestedById: actorId,
        targetType: input.targetType as CorrectionTargetType,
        targetId: input.targetId,
        proposedStart,
        proposedEnd,
        reason: input.reason,
        status: CorrectionStatus.APPROVED,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    await this.audit.record({
      actorId,
      action: AuditAction.ADMIN_DIRECT_CORRECTION,
      targetType: input.targetType,
      targetId: input.targetId,
      before: { start: before.start, end: before.end },
      after: { start: proposedStart, end: proposedEnd },
      metadata: { reason: input.reason },
    });
    return record;
  }
}
