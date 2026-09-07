import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  AuditAction,
  RejectUserInput,
  UpdateOwnProfileInput,
  UserStatus,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthService } from '../auth/auth.service';

const SELECT_SAFE_FIELDS = {
  id: true,
  firstName: true,
  surname: true,
  email: true,
  phoneNumber: true,
  role: true,
  status: true,
  employeeNumber: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  approvedById: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SELECT_SAFE_FIELDS,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // AC-002-003-02: role/status/department are administrator-only and never accepted here.
  async updateOwnProfile(userId: string, input: UpdateOwnProfileInput) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: SELECT_SAFE_FIELDS,
    });
    await this.audit.record({
      actorId: userId,
      action: AuditAction.USER_UPDATED,
      targetType: 'User',
      targetId: userId,
      after: input,
    });
    return user;
  }

  async list(filters: {
    status?: string;
    role?: string;
    departmentId?: string;
    search?: string;
  }) {
    return this.prisma.user.findMany({
      where: {
        status: filters.status as never,
        role: filters.role as never,
        departmentId: filters.departmentId,
        ...(filters.search
          ? {
              OR: [
                {
                  firstName: { contains: filters.search, mode: 'insensitive' },
                },
                { surname: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: SELECT_SAFE_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  // US-002-001: administrator onboards a user directly; a set-password link replaces a
  // plaintext temp password so no secret ever passes through the admin's hands.
  async adminCreate(actorId: string, input: AdminCreateUserInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing)
      throw new ConflictException('An account with this email already exists');

    const placeholderPasswordHash = await argon2.hash(
      randomBytes(32).toString('hex'),
      {
        type: argon2.argon2id,
      },
    );

    const user = await this.prisma.user.create({
      data: {
        firstName: input.firstName,
        surname: input.surname,
        email: input.email,
        phoneNumber: input.phoneNumber,
        role: input.role,
        status: UserStatus.ACTIVE,
        departmentId: input.departmentId,
        employeeNumber: input.employeeNumber,
        passwordHash: placeholderPasswordHash,
        approvedById: actorId,
        approvedAt: new Date(),
      },
      select: SELECT_SAFE_FIELDS,
    });

    await this.authService.createPasswordResetToken(user.id, user.email);
    await this.audit.record({
      actorId,
      action: AuditAction.USER_CREATED,
      targetType: 'User',
      targetId: user.id,
      after: { email: user.email, role: user.role },
    });
    return user;
  }

  async adminUpdate(
    actorId: string,
    userId: string,
    input: AdminUpdateUserInput,
  ) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('User not found');

    if (input.email && input.email !== before.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existing) throw new ConflictException('Email already in use');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: SELECT_SAFE_FIELDS,
    });

    if (input.role && input.role !== before.role) {
      await this.audit.record({
        actorId,
        action: AuditAction.USER_ROLE_CHANGED,
        targetType: 'User',
        targetId: userId,
        before: { role: before.role },
        after: { role: input.role },
      });
    }
    if (input.status && input.status !== before.status) {
      await this.audit.record({
        actorId,
        action: AuditAction.USER_STATUS_CHANGED,
        targetType: 'User',
        targetId: userId,
        before: { status: before.status },
        after: { status: input.status },
      });
    }
    await this.audit.record({
      actorId,
      action: AuditAction.USER_UPDATED,
      targetType: 'User',
      targetId: userId,
      before: {
        firstName: before.firstName,
        surname: before.surname,
        phoneNumber: before.phoneNumber,
      },
      after: input,
    });

    return user;
  }

  // US-001-002: approving activates the account and records approver/date (AC-001-002-03).
  async approve(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Only pending users can be approved');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        approvedById: actorId,
        approvedAt: new Date(),
      },
      select: SELECT_SAFE_FIELDS,
    });
    await this.audit.record({
      actorId,
      action: AuditAction.USER_APPROVED,
      targetType: 'User',
      targetId: userId,
    });
    return updated;
  }

  async reject(actorId: string, userId: string, input: RejectUserInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Only pending users can be rejected');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.REJECTED },
      select: SELECT_SAFE_FIELDS,
    });
    await this.audit.record({
      actorId,
      action: AuditAction.USER_REJECTED,
      targetType: 'User',
      targetId: userId,
      metadata: { reason: input.reason },
    });
    return updated;
  }
}
