import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminDirectProfileUpdateInput,
  AuditAction,
  DecideProfileChangeInput,
  ProfileChangeStatus,
  ProfileChangeTargetType,
  RequestProfileChangeInput,
  UpdateEmergencyContactInput,
  UpdateEmployeeProfileInput,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { maskProfileData } from '../../common/utils/mask-profile-data';

@Injectable()
export class ProfileChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Selects only the actual profile fields, not id/userId/createdAt/updatedAt -
  // found live: the admin review diff was rendering those as spurious
  // "changed from nothing" rows alongside the real fields, since proposedData
  // (built from the employee's form) never carries them but the full Prisma
  // row does. Also keeps the audit before/after payload in decide() free of
  // the same noise, which duplicates targetId/createdAt already on the
  // AuditLog row itself.
  private getCurrent(userId: string, targetType: ProfileChangeTargetType) {
    if (targetType === ProfileChangeTargetType.EMPLOYEE_PROFILE) {
      return this.prisma.employeeProfile.findUnique({
        where: { userId },
        select: {
          address: true,
          mobilePhone: true,
          personalEmail: true,
          bankAccountName: true,
          bankSortCode: true,
          bankAccountNumber: true,
        },
      });
    }
    return this.prisma.emergencyContact.findUnique({
      where: { userId },
      select: {
        fullName: true,
        relationship: true,
        mobile: true,
        landline: true,
        email: true,
        address: true,
      },
    });
  }

  private applyChange(
    userId: string,
    targetType: ProfileChangeTargetType,
    data: Record<string, unknown>,
  ) {
    if (targetType === ProfileChangeTargetType.EMPLOYEE_PROFILE) {
      const fields = data as UpdateEmployeeProfileInput;
      return this.prisma.employeeProfile.upsert({
        where: { userId },
        create: { userId, ...fields },
        update: fields,
      });
    }
    const fields = data as UpdateEmergencyContactInput;
    return this.prisma.emergencyContact.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });
  }

  // US-012-003/004: employee proposes a change to their own Personal Details or
  // Emergency Contact; always self-targeted (userId/requestedById are the same
  // value here) so there's no separate ownership lookup the way corrections
  // needs one for a targetId pointing at someone else's record.
  async request(userId: string, input: RequestProfileChangeInput) {
    const existing = await this.prisma.profileChangeRequest.findFirst({
      where: {
        userId,
        targetType: input.targetType,
        status: ProfileChangeStatus.PENDING,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have a pending request for this section - wait for it to be decided before submitting another',
      );
    }
    const request = await this.prisma.profileChangeRequest.create({
      data: {
        userId,
        requestedById: userId,
        targetType: input.targetType,
        proposedData: input.proposedData as never,
        reason: input.reason,
        status: ProfileChangeStatus.PENDING,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: AuditAction.PROFILE_CHANGE_REQUESTED,
      targetType: input.targetType,
      targetId: userId,
      metadata: { profileChangeRequestId: request.id, reason: input.reason },
    });
    return {
      ...request,
      proposedData: maskProfileData(request.proposedData as Record<string, unknown>),
    };
  }

  // US-012-004: admin sees the current live value next to what's proposed -
  // same "must show current, not just proposed" reasoning as
  // corrections.service.ts's listPending(). proposedData is intentionally NOT
  // masked here (see maskProfileData's doc comment) - current IS.
  async listPending() {
    const requests = await this.prisma.profileChangeRequest.findMany({
      where: { status: ProfileChangeStatus.PENDING },
      include: {
        user: { select: { id: true, firstName: true, surname: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      requests.map(async (r) => {
        const current = await this.getCurrent(
          r.userId,
          r.targetType as ProfileChangeTargetType,
        );
        return {
          ...r,
          current: maskProfileData(current as Record<string, unknown> | null),
        };
      }),
    );
  }

  async listMine(userId: string) {
    const requests = await this.prisma.profileChangeRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => ({
      ...r,
      proposedData: maskProfileData(r.proposedData as Record<string, unknown>),
    }));
  }

  async decide(
    actorId: string,
    requestId: string,
    input: DecideProfileChangeInput,
  ) {
    const request = await this.prisma.profileChangeRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Profile change request not found');
    if (request.status !== ProfileChangeStatus.PENDING) {
      throw new BadRequestException('This request has already been decided');
    }

    if (!input.approve) {
      const rejected = await this.prisma.profileChangeRequest.update({
        where: { id: requestId },
        data: {
          status: ProfileChangeStatus.REJECTED,
          decidedById: actorId,
          decidedAt: new Date(),
          decisionComment: input.comment,
        },
      });
      await this.audit.record({
        actorId,
        action: AuditAction.PROFILE_CHANGE_REJECTED,
        targetType: request.targetType,
        targetId: request.userId,
        metadata: { profileChangeRequestId: request.id, comment: input.comment },
      });
      return rejected;
    }

    const before = await this.getCurrent(
      request.userId,
      request.targetType as ProfileChangeTargetType,
    );
    await this.applyChange(
      request.userId,
      request.targetType as ProfileChangeTargetType,
      request.proposedData as Record<string, unknown>,
    );
    const after = await this.getCurrent(
      request.userId,
      request.targetType as ProfileChangeTargetType,
    );

    const approved = await this.prisma.profileChangeRequest.update({
      where: { id: requestId },
      data: {
        status: ProfileChangeStatus.APPROVED,
        decidedById: actorId,
        decidedAt: new Date(),
        decisionComment: input.comment,
      },
    });
    await this.audit.record({
      actorId,
      action: AuditAction.PROFILE_CHANGE_APPROVED,
      targetType: request.targetType,
      targetId: request.userId,
      before: maskProfileData(before as Record<string, unknown> | null),
      after: maskProfileData(after as Record<string, unknown> | null),
      metadata: { profileChangeRequestId: request.id },
    });
    return approved;
  }

  // US-012-005: administrator direct update - applies immediately, still
  // recorded as an already-APPROVED ProfileChangeRequest row so both paths
  // (queued vs direct) show up in the same history, matching
  // adminDirectCorrection's precedent exactly.
  async adminDirectUpdate(actorId: string, input: AdminDirectProfileUpdateInput) {
    const before = await this.getCurrent(input.userId, input.targetType);
    await this.applyChange(input.userId, input.targetType, input.data);
    const after = await this.getCurrent(input.userId, input.targetType);

    const record = await this.prisma.profileChangeRequest.create({
      data: {
        userId: input.userId,
        requestedById: actorId,
        targetType: input.targetType,
        proposedData: input.data as never,
        reason: 'Direct admin update',
        status: ProfileChangeStatus.APPROVED,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    await this.audit.record({
      actorId,
      action: AuditAction.ADMIN_DIRECT_PROFILE_UPDATE,
      targetType: input.targetType,
      targetId: input.userId,
      before: maskProfileData(before as Record<string, unknown> | null),
      after: maskProfileData(after as Record<string, unknown> | null),
    });
    return record;
  }
}
